import { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ============================================================
// SDS-PAGE GEL ANALYZER v6
// TIFF fallback, chart crosshair with MW, synced gel line
// ============================================================

// ── LZW decompressor for TIFF ──
function decompressLZW(input, expectedSize) {
  const out = new Uint8Array(expectedSize || input.length * 4);
  let oPos = 0;
  const CLEAR = 256, EOI = 257;
  let codeSize = 9, nextCode = 258, mask = (1 << 9) - 1;
  let table = [];
  for (let i = 0; i < 256; i++) table[i] = [i];
  let buf = 0, bits = 0, bPos = 0;
  const readCode = () => {
    while (bits < codeSize) {
      if (bPos >= input.length) return EOI;
      buf = (buf << 8) | input[bPos++];
      bits += 8;
    }
    bits -= codeSize;
    return (buf >> bits) & mask;
  };
  let prev = null;
  while (true) {
    const code = readCode();
    if (code === EOI || code === undefined) break;
    if (code === CLEAR) {
      codeSize = 9; nextCode = 258; mask = (1 << 9) - 1;
      table = []; for (let i = 0; i < 256; i++) table[i] = [i];
      prev = null; continue;
    }
    let entry;
    if (code < nextCode) entry = table[code];
    else if (code === nextCode && prev) entry = [...prev, prev[0]];
    else break;
    if (!entry) break;
    for (let i = 0; i < entry.length; i++) { if (oPos < out.length) out[oPos++] = entry[i]; }
    if (prev && nextCode < 4096) {
      table[nextCode++] = [...prev, entry[0]];
      if (nextCode > mask && codeSize < 12) { codeSize++; mask = (1 << codeSize) - 1; }
    }
    prev = entry;
  }
  return out.subarray(0, oPos);
}

// ── PackBits decompressor ──
function decompressPackBits(input, expectedSize) {
  const out = new Uint8Array(expectedSize || input.length * 2);
  let iPos = 0, oPos = 0;
  while (iPos < input.length && oPos < out.length) {
    const b = input[iPos++];
    if (b === 128) continue;
    if (b < 128) { const n = b + 1; for (let i = 0; i < n && iPos < input.length; i++) out[oPos++] = input[iPos++]; }
    else { const n = 257 - b; const val = input[iPos++]; for (let i = 0; i < n; i++) out[oPos++] = val; }
  }
  return out.subarray(0, oPos);
}

// ── TIFF decoder (supports uncompressed, LZW, PackBits — 8/16-bit gray/RGB + Predictor) ──
function decodeTIFF(buffer) {
  const dv = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const le = dv.getUint16(0) === 0x4949;
  const r16 = (o) => dv.getUint16(o, le);
  const r32 = (o) => dv.getUint32(o, le);
  if (r16(2) !== 42) throw new Error("Not a TIFF");
  let ifdOff = r32(4);
  const n = r16(ifdOff);
  let w=0,h=0,bps=8,comp=1,strips=[],sbc=[],rps=0,spp=1,photo=1,predictor=1;
  for (let i=0;i<n;i++) {
    const off=ifdOff+2+i*12;
    const tag=r16(off),type=r16(off+2),count=r32(off+4),vo=off+8;
    // typeSize: BYTE=1, SHORT=2, LONG=4
    const tSz=type===3?2:type===4?4:1;
    // If data fits in 4 bytes, value is inline; otherwise vo contains an offset
    const rv=()=>{
      if(count*tSz<=4){if(type===3)return r16(vo);if(type===4)return r32(vo);return dv.getUint8(vo);}
      // Data is at offset
      const d=r32(vo);if(type===3)return r16(d);if(type===4)return r32(d);return dv.getUint8(d);
    };
    const ra=()=>{
      if(count===1)return[rv()];
      const d=(count*tSz<=4)?vo:r32(vo);
      const a=[];for(let j=0;j<count;j++){if(type===3)a.push(r16(d+j*2));else if(type===4)a.push(r32(d+j*4));else a.push(dv.getUint8(d+j));}return a;
    };
    switch(tag){
      case 256:w=rv();break;case 257:h=rv();break;case 258:bps=ra()[0];break;
      case 259:comp=rv();break;case 262:photo=rv();break;
      case 273:strips=ra();break;case 277:spp=rv();break;
      case 278:rps=rv();break;case 279:sbc=ra();break;
      case 317:predictor=rv();break;
    }
  }
  if(![1,5,32773].includes(comp)) throw new Error("Unsupported compression: "+comp);
  if(!w||!h) throw new Error("Invalid dimensions");
  if(!rps) rps=h;
  const bytesPerSample=Math.ceil(bps/8);
  const bpp=bytesPerSample*spp;
  const rowBytes=w*bpp;

  // Read & decompress all strips into one buffer
  const allPixelBytes=new Uint8Array(h*rowBytes);
  let writePos=0;

  for(let s=0;s<strips.length;s++){
    const sOff=strips[s];
    const sLen=sbc[s]||(Math.min(rps,h-Math.floor(writePos/rowBytes))*rowBytes);
    const rawStrip=bytes.subarray(sOff,sOff+sLen);
    let decoded;
    const rowsThisStrip=Math.min(rps,h-Math.floor(writePos/rowBytes));
    const expectedBytes=rowsThisStrip*rowBytes;
    if(comp===5) decoded=decompressLZW(rawStrip,expectedBytes);
    else if(comp===32773) decoded=decompressPackBits(rawStrip,expectedBytes);
    else decoded=rawStrip;

    for(let i=0;i<decoded.length&&writePos<allPixelBytes.length;i++){
      allPixelBytes[writePos++]=decoded[i];
    }
  }

  // Apply horizontal differencing predictor (tag 317 = 2)
  if(predictor===2){
    for(let row=0;row<h;row++){
      const rOff=row*rowBytes;
      // For each sample channel, accumulate across the row
      for(let col=1;col<w;col++){
        for(let ch=0;ch<spp;ch++){
          const curr=rOff+(col*spp+ch)*bytesPerSample;
          const prev=rOff+((col-1)*spp+ch)*bytesPerSample;
          if(bytesPerSample===1){
            allPixelBytes[curr]=(allPixelBytes[curr]+allPixelBytes[prev])&0xFF;
          }else if(bytesPerSample===2){
            let prevVal=le?(allPixelBytes[prev]|(allPixelBytes[prev+1]<<8)):(allPixelBytes[prev]<<8|allPixelBytes[prev+1]);
            let curVal=le?(allPixelBytes[curr]|(allPixelBytes[curr+1]<<8)):(allPixelBytes[curr]<<8|allPixelBytes[curr+1]);
            curVal=(curVal+prevVal)&0xFFFF;
            if(le){allPixelBytes[curr]=curVal&0xFF;allPixelBytes[curr+1]=(curVal>>8)&0xFF;}
            else{allPixelBytes[curr]=(curVal>>8)&0xFF;allPixelBytes[curr+1]=curVal&0xFF;}
          }
        }
      }
    }
  }

  // Extract pixel values
  const raw=new Float64Array(w*h);
  let px=0;
  for(let i=0;i<w*h&&px<raw.length;i++){
    const pos=i*bpp;
    let v;
    if(bps===8){
      if(spp>=3) v=0.299*allPixelBytes[pos]+0.587*allPixelBytes[pos+1]+0.114*allPixelBytes[pos+2];
      else v=allPixelBytes[pos];
    }else if(bps===16){
      v=le?(allPixelBytes[pos]|(allPixelBytes[pos+1]<<8)):(allPixelBytes[pos]<<8|allPixelBytes[pos+1]);
    }else if(bps===32){
      const tmp=new ArrayBuffer(4);const tv=new DataView(tmp);
      for(let k=0;k<4;k++) tv.setUint8(k,allPixelBytes[pos+k]);
      v=tv.getFloat32(0,le); if(!isFinite(v)) v=tv.getUint32(0,le);
    }else v=0;
    raw[px++]=v;
  }

  // Auto-normalize to 0-255
  let rMin=Infinity,rMax=-Infinity;
  for(let i=0;i<px;i++){if(raw[i]<rMin)rMin=raw[i];if(raw[i]>rMax)rMax=raw[i];}
  const gray=new Float64Array(w*h);
  const range=rMax-rMin||1;
  for(let i=0;i<px;i++){
    let v=((raw[i]-rMin)/range)*255;
    if(photo===0) v=255-v;
    gray[i]=Math.max(0,Math.min(255,v));
  }
  return{gray,width:w,height:h};
}

// ── Colormaps ──
function makeColormap(name){
  const maps={
    gray:t=>{const v=Math.round(t*255);return[v,v,v];},
    invert:t=>{const v=Math.round((1-t)*255);return[v,v,v];},
    jet:t=>{let r=0,g=0,b=0;if(t<0.125){b=128+t*1024;}else if(t<0.375){b=255;g=(t-0.125)*1020;}else if(t<0.625){g=255;b=255-(t-0.375)*1020;r=(t-0.375)*1020;}else if(t<0.875){r=255;g=255-(t-0.625)*1020;}else{r=255-(t-0.875)*1020;}return[Math.max(0,Math.min(255,r)),Math.max(0,Math.min(255,g)),Math.max(0,Math.min(255,b))];},
    viridis:t=>{const c=[[68,1,84],[72,35,116],[64,67,135],[52,94,141],[41,120,142],[32,144,140],[34,167,132],[68,190,112],[121,209,81],[189,222,38],[253,231,37]];const idx=t*(c.length-1);const i=Math.floor(idx),f=idx-i;const a=c[Math.min(i,c.length-1)],b=c[Math.min(i+1,c.length-1)];return[Math.round(a[0]+(b[0]-a[0])*f),Math.round(a[1]+(b[1]-a[1])*f),Math.round(a[2]+(b[2]-a[2])*f)];},
    hot:t=>{return[Math.round(Math.min(1,t*2.5)*255),Math.round(Math.max(0,Math.min(1,(t-0.4)*2.5))*255),Math.round(Math.max(0,Math.min(1,(t-0.7)*3.33))*255)];},
    cool:t=>[Math.round(t*255),Math.round((1-t)*255),255],
    bone:t=>{const v=t*255;const r=t<0.375?v*0.85:t<0.75?v*0.88+30:v;const g=t<0.375?v*0.85:t<0.75?v*0.88+10:v*0.95+12;const b=t<0.375?v*0.85+40:t<0.75?v*0.75+60:v;return[Math.max(0,Math.min(255,Math.round(r))),Math.max(0,Math.min(255,Math.round(g))),Math.max(0,Math.min(255,Math.round(b)))];},
  };
  const fn=maps[name]||maps.gray;
  const lut=new Uint8Array(256*3);
  for(let i=0;i<256;i++){const[r,g,b]=fn(i/255);lut[i*3]=r;lut[i*3+1]=g;lut[i*3+2]=b;}
  return lut;
}

function extractLaneProfile(gray,w,h,xPos,laneW){
  const hw=Math.floor(laneW/2),x0=Math.max(0,xPos-hw),x1=Math.min(w-1,xPos+hw);
  const p=new Float64Array(h);
  for(let y=0;y<h;y++){let s=0,c=0;for(let x=x0;x<=x1;x++){s+=gray[y*w+x];c++;}p[y]=255-s/c;}
  return p;
}
function smooth(p,ws=11){
  if(p.length<ws)return Array.from(p);const h=Math.floor(ws/2);const r=new Float64Array(p.length);
  for(let i=0;i<p.length;i++){let s=0,w=0;for(let j=Math.max(0,i-h);j<=Math.min(p.length-1,i+h);j++){const wt=1-Math.abs(j-i)/(h+1);s+=p[j]*wt;w+=wt;}r[i]=s/w;}return r;
}
function findPeaks(p,prom,minD){
  const pks=[];
  for(let i=1;i<p.length-1;i++){
    if(p[i]>p[i-1]&&p[i]>p[i+1]){
      let lm=p[i],rm=p[i];
      for(let j=i-1;j>=Math.max(0,i-60);j--)lm=Math.min(lm,p[j]);
      for(let j=i+1;j<=Math.min(p.length-1,i+60);j++)rm=Math.min(rm,p[j]);
      const pr=p[i]-Math.max(lm,rm);
      if(pr>=prom){
        // Find peak boundaries (descent to local minimum on each side)
        let lb=i,rb=i;
        while(lb>0&&p[lb-1]<=p[lb])lb--;
        while(rb<p.length-1&&p[rb+1]<=p[rb])rb++;
        pks.push({pos:i,intensity:p[i],prominence:pr,left:lb,right:rb});
      }
    }
  }
  const f=[];
  for(const pk of pks){
    if(!f.length||pk.pos-f[f.length-1].pos>=minD)f.push(pk);
    else if(pk.intensity>f[f.length-1].intensity)f[f.length-1]=pk;
  }
  return f;
}

// ── Peak area (trapezoidal integration above baseline) ──
function computePeakAreas(profile,peaks,baseline){
  if(!peaks.length)return[];
  return peaks.map(pk=>{
    const{left,right}=pk;
    const w=right-left||1;
    let area=0;
    for(let i=left;i<right;i++){
      const bl1=baseline?baseline[i]:0;
      const bl2=baseline?baseline[i+1]||bl1:0;
      const h1=Math.max(0,profile[i]-bl1);
      const h2=Math.max(0,(profile[i+1]||0)-bl2);
      area+=(h1+h2)/2;
    }
    return{...pk,area};
  });
}

// ── Baseline methods ──
// Rolling ball: morphological opening (erosion then dilation)
function rollingBallBaseline(profile,radius){
  const n=profile.length;const r=Math.max(1,Math.round(radius));
  // Erosion (local min)
  const eroded=new Float64Array(n);
  for(let i=0;i<n;i++){
    let mn=profile[i];
    for(let j=Math.max(0,i-r);j<=Math.min(n-1,i+r);j++){
      // Rolling ball shape: subtract circular offset
      const dx=Math.abs(j-i);const offset=r-Math.sqrt(Math.max(0,r*r-dx*dx));
      const val=profile[j]+offset;
      if(val<mn) mn=val;
    }
    eroded[i]=mn;
  }
  // Dilation (local max of eroded)
  const baseline=new Float64Array(n);
  for(let i=0;i<n;i++){
    let mx=eroded[i];
    for(let j=Math.max(0,i-r);j<=Math.min(n-1,i+r);j++){
      const dx=Math.abs(j-i);const offset=r-Math.sqrt(Math.max(0,r*r-dx*dx));
      const val=eroded[j]-offset;
      if(val>mx) mx=val;
    }
    baseline[i]=mx;
  }
  return baseline;
}

// Valley-to-valley: connect all local minima with linear interpolation
function valleyBaseline(profile){
  const n=profile.length;
  // Find local minima
  const mins=[{pos:0,val:profile[0]}];
  for(let i=1;i<n-1;i++){
    if(profile[i]<=profile[i-1]&&profile[i]<=profile[i+1]) mins.push({pos:i,val:profile[i]});
  }
  mins.push({pos:n-1,val:profile[n-1]});
  // Interpolate
  const baseline=new Float64Array(n);
  let mi=0;
  for(let i=0;i<n;i++){
    while(mi<mins.length-2&&mins[mi+1].pos<i) mi++;
    const a=mins[mi],b=mins[mi+1];
    const frac=(b.pos-a.pos)>0?(i-a.pos)/(b.pos-a.pos):0;
    baseline[i]=a.val+(b.val-a.val)*frac;
  }
  return baseline;
}

// Polynomial MW calibration (degree 2)
function polyFitMW(rfs,logMws){
  if(rfs.length<3) return linReg(rfs,logMws); // fallback to linear
  const fit=fitQuadratic(rfs,logMws);
  if(!fit) return linReg(rfs,logMws);
  // Compute R²
  const yM=logMws.reduce((s,v)=>s+v,0)/logMws.length;
  let ssTot=0,ssRes=0;
  for(let i=0;i<rfs.length;i++){
    ssTot+=(logMws[i]-yM)**2;
    const pred=fit.a*rfs[i]*rfs[i]+fit.b*rfs[i]+fit.c;
    ssRes+=(logMws[i]-pred)**2;
  }
  return{...fit,r2:ssTot===0?1:1-ssRes/ssTot,isPoly:true};
}

const BASELINE_MODES=["none","valley","rollingball"];
const BASELINE_LABELS={none:"Aucune",valley:"Vallée-à-vallée",rollingball:"Rolling ball"};
const MW_FIT_MODES=["linear","polynomial"];
const MW_FIT_LABELS={linear:"Linéaire",polynomial:"Polynomiale (deg 2)"};
function linReg(xs,ys){const n=xs.length;let sx=0,sy=0,sxx=0,sxy=0;for(let i=0;i<n;i++){sx+=xs[i];sy+=ys[i];sxx+=xs[i]*xs[i];sxy+=xs[i]*ys[i];}const sl=(n*sxy-sx*sy)/(n*sxx-sx*sx),ic=(sy-sl*sx)/n,yM=sy/n;let st=0,sr=0;for(let i=0;i<n;i++){st+=(ys[i]-yM)**2;sr+=(ys[i]-(sl*xs[i]+ic))**2;}return{slope:sl,intercept:ic,r2:st===0?1:1-sr/st};}

// ── Quadratic fit: y = a*x² + b*x + c  (least squares) ──
function fitQuadratic(xs,ys){
  const n=xs.length;if(n<3)return null;
  // Normal equations for polynomial degree 2
  let s0=n,s1=0,s2=0,s3=0,s4=0,t0=0,t1=0,t2=0;
  for(let i=0;i<n;i++){
    const x=xs[i],y=ys[i],x2=x*x;
    s1+=x;s2+=x2;s3+=x2*x;s4+=x2*x2;
    t0+=y;t1+=x*y;t2+=x2*y;
  }
  // Solve 3x3 system: [s0 s1 s2; s1 s2 s3; s2 s3 s4] * [c b a]^T = [t0 t1 t2]^T
  const M=[[s0,s1,s2,t0],[s1,s2,s3,t1],[s2,s3,s4,t2]];
  // Gauss elimination
  for(let col=0;col<3;col++){
    let maxR=col;for(let r=col+1;r<3;r++)if(Math.abs(M[r][col])>Math.abs(M[maxR][col]))maxR=r;
    [M[col],M[maxR]]=[M[maxR],M[col]];
    if(Math.abs(M[col][col])<1e-12)return null;
    for(let r=col+1;r<3;r++){const f=M[r][col]/M[col][col];for(let j=col;j<4;j++)M[r][j]-=f*M[col][j];}
  }
  const c2=M[2][3]/M[2][2];
  const b2=(M[1][3]-M[1][2]*c2)/M[1][1];
  const a2=(M[0][3]-M[0][1]*b2-M[0][2]*c2)/M[0][0];
  return{a:c2,b:b2,c:a2}; // y = a*x² + b*x + c
}

const COLORS=["#EF4444","#3B82F6","#10B981","#F59E0B","#8B5CF6","#EC4899","#06B6D4","#F97316","#6366F1","#14B8A6"];
const TOOLS={SELECT:"select",ADD_LANE:"addLane",CALIB:"calib",CURVATURE:"curvature",CROP:"crop",ANNOTATE:"annotate"};
const LADDERS={"NEB Color Prestained BR":[250,180,130,95,72,55,43,34,26,17,10],"PageRuler Plus":[250,130,100,70,55,35,25,15,10],"PageRuler":[170,130,100,70,55,40,35,25,15,10],"Precision Plus Dual":[250,150,100,75,50,37,25,20,15,10],"BenchMark":[220,160,120,100,90,80,70,60,50,40,30,25,20,15,10],"Spectra BR":[260,140,100,70,50,40,35,25,15,10],"Custom":[]};
const COLORMAPS=["gray","invert","jet","viridis","hot","cool","bone"];
const CMAP_LBL={gray:"Gris",invert:"Inversé",jet:"Jet",viridis:"Viridis",hot:"Hot",cool:"Cool",bone:"Bone"};

export default function SDSPageAnalyzer(){
  const [grayData,setGrayData]=useState(null);
  const [imgW,setImgW]=useState(0);
  const [imgH,setImgH]=useState(0);
  const [contrast,setContrast]=useState(1.0);
  const [brightness,setBrightness]=useState(1.0);
  const [colormap,setColormap]=useState("gray");
  const [imgZoom,setImgZoom]=useState(1);
  const [imgPan,setImgPan]=useState({x:0,y:0});
  const [isPanning,setIsPanning]=useState(false);
  const [panStart,setPanStart]=useState({x:0,y:0});
  const [lanes,setLanes]=useState([]);
  const [activeLane,setActiveLane]=useState(null);
  const [laneWidth,setLaneWidth]=useState(5);
  const [draggingLane,setDraggingLane]=useState(null);
  const [draggingHandle,setDraggingHandle]=useState(null); // "top"|"bot"|"all"
  const [tool,setTool]=useState(TOOLS.SELECT);
  const [compareLanes,setCompareLanes]=useState(new Set());
  const [prominence,setProminence]=useState(12);
  const [minPeakDist,setMinPeakDist]=useState(15);
  const [baselineMode,setBaselineMode]=useState("rollingball");
  const [rbRadius,setRbRadius]=useState(50);
  const [showBaseline,setShowBaseline]=useState(true);
  const [mwFitMode,setMwFitMode]=useState("linear");
  const [yStart,setYStart]=useState(0);
  const [yEnd,setYEnd]=useState(0);
  const [calibLane,setCalibLane]=useState(null);
  const [ladderName,setLadderName]=useState("NEB Color Prestained BR");
  const [mwList,setMwList]=useState([250,180,130,95,72,55,43,34,26,17,10]);
  const [mwCustom,setMwCustom]=useState("250,180,130,95,72,55,43,34,26,17,10");
  const [mwAssign,setMwAssign]=useState([]);
  const [calibClickIdx,setCalibClickIdx]=useState(0);
  const [chartZoom,setChartZoom]=useState({xMin:0,xMax:1});
  const [chartPanning,setChartPanning]=useState(false);
  const [chartPanStart,setChartPanStart]=useState(null);
  const [activeTab,setActiveTab]=useState("profile");
  const [errMsg,setErrMsg]=useState(null);
  const [dScale,setDScale]=useState(1);
  const [rightPanelW,setRightPanelW]=useState(560);
  const [isResizingPanel,setIsResizingPanel]=useState(false);

  // ── Hover crosshair state ──
  const [hoverY,setHoverY]=useState(null);

  // ── Rf Curves (distortion correction) ──
  const [rfCurves,setRfCurves]=useState([]); // [{id, points:[{x,y}], color}]
  const [activeRfCurve,setActiveRfCurve]=useState(null); // index being edited
  const [rfEnabled,setRfEnabled]=useState(true);
  const rfIdCounter=useRef(0);

  // ── Image editing ──
  const [rotation,setRotation]=useState(0); // 0, 90, 180, 270
  const [flipH,setFlipH]=useState(false);
  const [flipV,setFlipV]=useState(false);
  const [cropRect,setCropRect]=useState(null); // {x,y,w,h} being drawn
  const [cropStart,setCropStart]=useState(null);
  const [annotations,setAnnotations]=useState([]); // [{id,x,y,text,color}]
  const [editingAnnot,setEditingAnnot]=useState(null); // id being edited
  const [annotColor,setAnnotColor]=useState("#FBBF24");
  const [origGrayData,setOrigGrayData]=useState(null); // backup for undo of crop/rotate
  const annotIdCounter=useRef(0);

  const gelRef=useRef(null);
  const fileRef=useRef(null);
  const gelContainerRef=useRef(null);
  const chartSvgRef=useRef(null);
  const calibChartRef=useRef(null);

  useEffect(()=>{setCompareLanes(prev=>{const next=new Set();lanes.forEach((_,i)=>{if(prev.has(i)||prev.size===0)next.add(i);});return next;});},[lanes.length]);
  useEffect(()=>{if(ladderName!=="Custom"){const v=LADDERS[ladderName]||[];setMwList(v);setMwCustom(v.join(", "));}},[ladderName]);
  const applyCustomMW=useCallback(()=>{const v=mwCustom.split(/[,;\s]+/).map(Number).filter(v=>v>0).sort((a,b)=>b-a);if(v.length)setMwList(v);},[mwCustom]);

  const calibProfile=useMemo(()=>{
    if(calibLane===null||!grayData||!lanes[calibLane])return null;
    const adj=new Float64Array(grayData.length);
    for(let i=0;i<grayData.length;i++)adj[i]=Math.max(0,Math.min(255,(grayData[i]-128)*contrast+128+(brightness-1)*128));
    return smooth(extractLaneProfile(adj,imgW,imgH,Math.round((lanes[calibLane].xTop+lanes[calibLane].xBot)/2),laneWidth).slice(yStart,yEnd+1),9);
  },[calibLane,grayData,lanes,imgW,imgH,laneWidth,contrast,brightness,yStart,yEnd]);
  const calibPeaks=useMemo(()=>calibProfile?findPeaks(calibProfile,prominence,minPeakDist):[],[calibProfile,prominence,minPeakDist]);
  const autoAssign=useCallback(()=>{
    if(!calibPeaks.length||!mwList.length)return;
    const sorted=[...calibPeaks].sort((a,b)=>a.pos-b.pos);
    const n=Math.min(sorted.length,mwList.length);
    const a=[];for(let i=0;i<n;i++)a.push({mw:mwList[i],yPos:sorted[i].pos+yStart,auto:true});
    for(let i=n;i<mwList.length;i++)a.push({mw:mwList[i],yPos:"",auto:false});
    setMwAssign(a);
  },[calibPeaks,mwList,yStart]);

  const calibration=useMemo(()=>{
    const valid=mwAssign.filter(m=>m.yPos!==""&&!isNaN(+m.yPos)&&m.mw>0);
    if(valid.length<2)return null;
    const pos=valid.map(m=>+m.yPos);
    const top=Math.min(...pos),bot=Math.max(...pos);
    if(bot===top)return null;
    const rfs=pos.map(p=>(p-top)/(bot-top));
    const logMws=valid.map(m=>Math.log10(m.mw));
    const fit=mwFitMode==="polynomial"&&valid.length>=3?polyFitMW(rfs,logMws):linReg(rfs,logMws);
    return{...fit,top,bot,markers:valid,rfs,logMws};
  },[mwAssign,mwFitMode]);

  // ── Rf Curves: fit each curve and build dewarp lookup ──
  const rfCurvesFitted=useMemo(()=>{
    return rfCurves.map(curve=>{
      const pts=[...curve.points].sort((a,b)=>a.x-b.x);
      if(pts.length<2) return{...curve,pts,getY:()=>null};
      // Fit polynomial (quadratic if ≥3 pts, linear if 2)
      if(pts.length>=3){
        const fit=fitQuadratic(pts.map(p=>p.x),pts.map(p=>p.y));
        if(fit) return{...curve,pts,getY:(x)=>fit.a*x*x+fit.b*x+fit.c,fit};
      }
      // Linear fallback
      const x0=pts[0].x,y0=pts[0].y,x1=pts[pts.length-1].x,y1=pts[pts.length-1].y;
      const slope=(x1!==x0)?(y1-y0)/(x1-x0):0;
      return{...curve,pts,getY:(x)=>y0+slope*(x-x0)};
    });
  },[rfCurves]);

  // Dewarp: given idealY (output row) and laneX, return raw Y to read from image
  // This is the INVERSE warp: ideal → raw
  const dewarpY=useCallback((laneX,idealY)=>{
    if(!rfEnabled||rfCurvesFitted.length<2) return idealY;
    // Evaluate all Rf curves at this X and at center
    const evals=rfCurvesFitted.map(c=>{
      const rawAtX=c.getY(laneX);
      if(rawAtX===null) return null;
      const rawAtCenter=c.getY(imgW/2);
      return{rawAtX,idealY:rawAtCenter}; // idealY = where the band IS at center
    }).filter(Boolean).sort((a,b)=>a.idealY-b.idealY); // sort by ideal (center) position
    if(evals.length<2) return idealY;
    // Find bracket in ideal (center) space
    if(idealY<=evals[0].idealY){
      const di=evals[1].idealY-evals[0].idealY;const dr=evals[1].rawAtX-evals[0].rawAtX;
      if(di===0) return idealY;
      const frac=(idealY-evals[0].idealY)/di;
      return evals[0].rawAtX+frac*dr;
    }
    const last=evals.length-1;
    if(idealY>=evals[last].idealY){
      const di=evals[last].idealY-evals[last-1].idealY;const dr=evals[last].rawAtX-evals[last-1].rawAtX;
      if(di===0) return idealY;
      const frac=(idealY-evals[last-1].idealY)/di;
      return evals[last-1].rawAtX+frac*dr;
    }
    for(let i=0;i<evals.length-1;i++){
      if(idealY>=evals[i].idealY&&idealY<=evals[i+1].idealY){
        const di=evals[i+1].idealY-evals[i].idealY;
        if(di===0) return evals[i].rawAtX;
        const frac=(idealY-evals[i].idealY)/di;
        return evals[i].rawAtX+frac*(evals[i+1].rawAtX-evals[i].rawAtX);
      }
    }
    return idealY;
  },[rfEnabled,rfCurvesFitted,imgW]);

  // ── MW at any Y position ──
  const getMWatY=useCallback((absY)=>{
    if(!calibration)return null;
    const{slope,intercept,top,bot,isPoly,a,b,c}=calibration;
    const rf=(absY-top)/(bot-top);
    const logMw=isPoly?(a*rf*rf+b*rf+c):(slope*rf+intercept);
    return Math.pow(10,logMw);
  },[calibration]);

  // ── Image loading with TIFF fallback ──
  const processGrayData=(gray,w,h)=>{
    setGrayData(gray);setImgW(w);setImgH(h);
    setOrigGrayData({data:gray,w,h});
    setLanes([]);setActiveLane(null);setCalibLane(null);
    setYStart(0);setYEnd(h-1);
    setImgZoom(1);setImgPan({x:0,y:0});
    setChartZoom({xMin:0,xMax:1});
    setMwAssign([]);setErrMsg(null);setColormap("gray");setHoverY(null);
    setRfCurves([]);setActiveRfCurve(null);setRfEnabled(true);
    setRotation(0);setFlipH(false);setFlipV(false);setCropRect(null);setAnnotations([]);
  };

  // ── Image transforms ──
  const applyRotation=useCallback((deg)=>{
    if(!grayData)return;
    // Rotate 90° clockwise increments
    let g=grayData,w=imgW,h=imgH;
    const times=((deg/90)%4+4)%4;
    for(let t=0;t<times;t++){
      const ng=new Float64Array(w*h);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        // 90° CW: (x,y) → (h-1-y, x) in new [h×w]
        ng[x*h+(h-1-y)]=g[y*w+x];
      }
      g=ng;const tmp=w;w=h;h=tmp;
    }
    setGrayData(g);setImgW(w);setImgH(h);
    setYStart(0);setYEnd(h-1);setLanes([]);setActiveLane(null);setCalibLane(null);
    setRfCurves([]);setAnnotations([]);setMwAssign([]);
    setImgZoom(1);setImgPan({x:0,y:0});
  },[grayData,imgW,imgH]);

  const applyFlip=useCallback((horizontal)=>{
    if(!grayData)return;
    const g=new Float64Array(grayData.length);
    for(let y=0;y<imgH;y++)for(let x=0;x<imgW;x++){
      const sx=horizontal?imgW-1-x:x;
      const sy=horizontal?y:imgH-1-y;
      g[y*imgW+x]=grayData[sy*imgW+sx];
    }
    setGrayData(g);setLanes([]);setActiveLane(null);setCalibLane(null);setRfCurves([]);setMwAssign([]);
  },[grayData,imgW,imgH]);

  const applyCrop=useCallback(()=>{
    if(!grayData||!cropRect)return;
    const{x,y,w,h}=cropRect;
    const x0=Math.max(0,Math.round(Math.min(x,x+w)));
    const y0=Math.max(0,Math.round(Math.min(y,y+h)));
    const cw=Math.min(imgW-x0,Math.round(Math.abs(w)));
    const ch=Math.min(imgH-y0,Math.round(Math.abs(h)));
    if(cw<5||ch<5){setCropRect(null);return;}
    const g=new Float64Array(cw*ch);
    for(let yy=0;yy<ch;yy++)for(let xx=0;xx<cw;xx++){
      g[yy*cw+xx]=grayData[(y0+yy)*imgW+(x0+xx)];
    }
    setGrayData(g);setImgW(cw);setImgH(ch);
    setYStart(0);setYEnd(ch-1);setLanes([]);setActiveLane(null);setCalibLane(null);
    setRfCurves([]);setAnnotations([]);setMwAssign([]);setCropRect(null);
    setImgZoom(1);setImgPan({x:0,y:0});setTool(TOOLS.SELECT);
  },[grayData,cropRect,imgW,imgH]);

  const resetEdits=useCallback(()=>{
    if(!origGrayData)return;
    setGrayData(origGrayData.data);setImgW(origGrayData.w);setImgH(origGrayData.h);
    setYStart(0);setYEnd(origGrayData.h-1);
    setLanes([]);setActiveLane(null);setCalibLane(null);setRfCurves([]);setAnnotations([]);setMwAssign([]);
    setRotation(0);setFlipH(false);setFlipV(false);setCropRect(null);
    setImgZoom(1);setImgPan({x:0,y:0});
  },[origGrayData]);

  // Load image via DataURL (works reliably in artifact sandbox)
  const loadViaDataURL=(file)=>{
    const reader=new FileReader();
    reader.onerror=()=>setErrMsg("Lecture impossible.");
    reader.onload=()=>{
      const img=document.createElement("img");
      img.onerror=()=>setErrMsg("Format non supporté. Convertissez en PNG ou JPG.");
      img.onload=()=>{
        try{
          const w=img.naturalWidth||img.width,h=img.naturalHeight||img.height;
          if(!w||!h){setErrMsg("Image vide.");return;}
          const c=document.createElement("canvas");c.width=w;c.height=h;
          const ctx=c.getContext("2d",{willReadFrequently:true});
          ctx.drawImage(img,0,0,w,h);
          const id=ctx.getImageData(0,0,w,h);
          const gray=new Float64Array(w*h);
          for(let i=0;i<gray.length;i++)gray[i]=0.299*id.data[i*4]+0.587*id.data[i*4+1]+0.114*id.data[i*4+2];
          processGrayData(gray,w,h);
        }catch(e){setErrMsg("Erreur: "+e.message);}
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  };

  const loadImage=useCallback((file)=>{
    if(!file)return;
    setErrMsg(null);
    const name=file.name||"";
    const isTiff=name.match(/\.tiff?$/i)||file.type==="image/tiff";

    if(isTiff){
      // Try custom TIFF decoder first (handles uncompressed grayscale/RGB)
      const reader=new FileReader();
      reader.onerror=()=>{
        // Fallback to browser-native decode
        loadViaDataURL(file);
      };
      reader.onload=()=>{
        try{
          const{gray,width,height}=decodeTIFF(reader.result);
          if(gray.length===width*height&&width>0&&height>0){
            processGrayData(gray,width,height);
          }else{
            throw new Error("Données incomplètes");
          }
        }catch(e){
          console.warn("TIFF decoder failed:",e.message,", trying browser fallback");
          loadViaDataURL(file);
        }
      };
      reader.readAsArrayBuffer(file);
    }else{
      // PNG, JPEG, BMP, GIF etc — standard browser decode
      loadViaDataURL(file);
    }
  },[]);

  const handleFileInput=useCallback(e=>{const f=e.target.files?.[0];if(f)loadImage(f);if(e.target)e.target.value="";},[loadImage]);
  const handleDrop=useCallback(e=>{e.preventDefault();e.stopPropagation();const f=e.dataTransfer?.files?.[0];if(f)loadImage(f);},[loadImage]);

  const getPixel=useCallback(e=>{
    if(!gelRef.current)return null;
    const r=gelRef.current.getBoundingClientRect();
    return{px:Math.round((e.clientX-r.left-imgPan.x)/(dScale*imgZoom)),py:Math.round((e.clientY-r.top-imgPan.y)/(dScale*imgZoom))};
  },[dScale,imgZoom,imgPan]);

  const findNearLane=useCallback((px,py)=>{
    let best=-1,bd=Infinity,handle="all";
    lanes.forEach((l,i)=>{
      // Interpolate x at the given y position
      const frac=(yEnd>yStart&&py!==undefined)?Math.max(0,Math.min(1,(py-yStart)/(yEnd-yStart))):0.5;
      const lx=l.xTop+(l.xBot-l.xTop)*frac;
      const d=Math.abs(lx-px);
      if(d<bd&&d<laneWidth+12){bd=d;best=i;}
    });
    if(best>=0&&py!==undefined){
      const topDist=Math.abs(py-yStart);
      const botDist=Math.abs(py-yEnd);
      const range=yEnd-yStart;
      if(topDist<range*0.15) handle="top";
      else if(botDist<range*0.15) handle="bot";
      else handle="all";
    }
    return{idx:best,handle};
  },[lanes,laneWidth,yStart,yEnd]);
  const cmapLUT=useMemo(()=>makeColormap(colormap),[colormap]);

  // ── Draw gel (includes hover line) ──
  useEffect(()=>{
    if(!grayData||!gelRef.current)return;
    const canvas=gelRef.current;const container=gelContainerRef.current;if(!container)return;
    const cw=container.clientWidth,ch=container.clientHeight;
    const baseScale=Math.min(cw/imgW,ch/imgH,1);
    setDScale(baseScale);
    const dpr=window.devicePixelRatio||1;
    canvas.width=cw*dpr;canvas.height=ch*dpr;
    canvas.style.width=cw+"px";canvas.style.height=ch+"px";
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    ctx.scale(dpr,dpr);ctx.clearRect(0,0,cw,ch);
    ctx.save();ctx.translate(imgPan.x,imgPan.y);
    const sc=baseScale*imgZoom;

    const tmp=document.createElement("canvas");tmp.width=imgW;tmp.height=imgH;
    const tCtx=tmp.getContext("2d");const out=tCtx.createImageData(imgW,imgH);
    for(let i=0;i<grayData.length;i++){
      let v=(grayData[i]-128)*contrast+128+(brightness-1)*128;
      v=Math.max(0,Math.min(255,Math.round(v)));
      const ci=v*3;out.data[i*4]=cmapLUT[ci];out.data[i*4+1]=cmapLUT[ci+1];out.data[i*4+2]=cmapLUT[ci+2];out.data[i*4+3]=255;
    }
    tCtx.putImageData(out,0,0);ctx.drawImage(tmp,0,0,imgW*sc,imgH*sc);

    // Y range
    ctx.strokeStyle="#10B98180";ctx.lineWidth=1.5/imgZoom;
    ctx.setLineDash([6/imgZoom,3/imgZoom]);
    [yStart,yEnd].forEach(yy=>{ctx.beginPath();ctx.moveTo(0,yy*sc);ctx.lineTo(imgW*sc,yy*sc);ctx.stroke();});
    ctx.setLineDash([]);

    // Lanes
    lanes.forEach((lane,i)=>{
      const sxT=lane.xTop*sc,sxB=lane.xBot*sc,hw=(laneWidth*sc)/2;
      const col=COLORS[i%10];const act=activeLane===i;const isC=calibLane===i;
      ctx.fillStyle=col+(act?"35":"18");
      ctx.beginPath();ctx.moveTo(sxT-hw,yStart*sc);ctx.lineTo(sxT+hw,yStart*sc);ctx.lineTo(sxB+hw,yEnd*sc);ctx.lineTo(sxB-hw,yEnd*sc);ctx.closePath();ctx.fill();
      ctx.strokeStyle=isC?"#F59E0B":col;ctx.lineWidth=act?2.5:1.2;
      ctx.setLineDash(act?[]:[4,3]);ctx.beginPath();ctx.moveTo(sxT,yStart*sc);ctx.lineTo(sxB,yEnd*sc);ctx.stroke();ctx.setLineDash([]);
      if(act){
        ctx.fillStyle=col;ctx.beginPath();ctx.arc(sxT,yStart*sc+10,6,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#0F172A";ctx.beginPath();ctx.arc(sxT,yStart*sc+10,3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=col;ctx.beginPath();ctx.arc(sxB,yEnd*sc-10,6,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#0F172A";ctx.beginPath();ctx.arc(sxB,yEnd*sc-10,3,0,Math.PI*2);ctx.fill();
      }
      ctx.fillStyle=isC?"#F59E0B":col;ctx.font=`bold ${act?13:11}px monospace`;
      ctx.fillText(isC?`⚖ L${i+1}`:`L${i+1}${lane.xTop!==lane.xBot?" ∠":""}`,sxT-12,Math.max(12,yStart*sc-6));
    });

    // MW markers
    mwAssign.forEach(m=>{
      if(m.yPos!==""&&!isNaN(+m.yPos)){
        const my=+m.yPos*sc;
        ctx.strokeStyle="#F59E0B55";ctx.lineWidth=1;ctx.setLineDash([3,2]);
        ctx.beginPath();ctx.moveTo(0,my);ctx.lineTo(imgW*sc,my);ctx.stroke();ctx.setLineDash([]);
        ctx.fillStyle="#F59E0BDD";ctx.font="bold 9px monospace";ctx.fillText(`${m.mw}`,3,my-2);
      }
    });

    // ── Rf Curves overlay ──
    const RF_COLORS=["#FF61DC","#61DCFF","#DCFF61","#FF9F61","#61FF9F","#9F61FF"];
    rfCurvesFitted.forEach((curve,ci)=>{
      if(!curve.getY) return;
      const col=RF_COLORS[ci%RF_COLORS.length];
      const isActive=activeRfCurve===ci;
      // Draw fitted curve
      ctx.strokeStyle=col+(isActive?"CC":"66");
      ctx.lineWidth=isActive?2.5:1.5;
      ctx.setLineDash(isActive?[]:[5,3]);
      ctx.beginPath();
      for(let x=0;x<=imgW;x+=2){
        const y=curve.getY(x);
        if(y===null) continue;
        if(x===0) ctx.moveTo(x*sc,y*sc); else ctx.lineTo(x*sc,y*sc);
      }
      ctx.stroke();ctx.setLineDash([]);
      // Draw control points
      curve.pts.forEach(pt=>{
        ctx.fillStyle=col;ctx.beginPath();ctx.arc(pt.x*sc,pt.y*sc,isActive?6:4,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#0F172A";ctx.beginPath();ctx.arc(pt.x*sc,pt.y*sc,isActive?3:2,0,Math.PI*2);ctx.fill();
      });
      // Label
      ctx.fillStyle=col;ctx.font="bold 9px monospace";
      const labelY=curve.getY(10);
      if(labelY!==null) ctx.fillText(`Rf${ci+1}`,12*sc,(labelY-8)*sc);
    });

    // ── Hover horizontal line synced with chart ──
    if(hoverY!==null&&hoverY>=yStart&&hoverY<=yEnd){
      const hy=hoverY*sc;
      ctx.strokeStyle="#FF6B6B";ctx.lineWidth=1.5;ctx.setLineDash([]);
      ctx.beginPath();ctx.moveTo(0,hy);ctx.lineTo(imgW*sc,hy);ctx.stroke();
      // Label
      const mwAtPos=getMWatY(hoverY);
      ctx.fillStyle="#FF6B6BEE";ctx.font="bold 11px monospace";
      const label=mwAtPos?`Y=${hoverY}  ~${mwAtPos.toFixed(1)} kDa`:`Y=${hoverY}`;
      const tw=ctx.measureText(label).width;
      ctx.fillStyle="#0F172ACC";ctx.fillRect(imgW*sc-tw-12,hy-16,tw+8,15);
      ctx.fillStyle="#FF6B6B";ctx.fillText(label,imgW*sc-tw-8,hy-5);
    }

    // ── Annotations ──
    annotations.forEach(a=>{
      const ax=a.x*sc,ay=a.y*sc;
      ctx.fillStyle=a.color;ctx.beginPath();ctx.arc(ax,ay,3,0,Math.PI*2);ctx.fill();
      ctx.font="bold 12px monospace";
      const tw=ctx.measureText(a.text).width;
      ctx.fillStyle="#0F172ACC";ctx.fillRect(ax+6,ay-9,tw+6,15);
      ctx.fillStyle=a.color;ctx.fillText(a.text,ax+9,ay+2);
    });

    // ── Crop rectangle overlay ──
    if(tool===TOOLS.CROP&&cropRect){
      const rx=Math.min(cropRect.x,cropRect.x+cropRect.w)*sc;
      const ry=Math.min(cropRect.y,cropRect.y+cropRect.h)*sc;
      const rw=Math.abs(cropRect.w)*sc,rh=Math.abs(cropRect.h)*sc;
      // Darken outside
      ctx.fillStyle="#000000A0";
      ctx.fillRect(0,0,imgW*sc,ry);
      ctx.fillRect(0,ry+rh,imgW*sc,imgH*sc-ry-rh);
      ctx.fillRect(0,ry,rx,rh);
      ctx.fillRect(rx+rw,ry,imgW*sc-rx-rw,rh);
      // Border
      ctx.strokeStyle="#22D3EE";ctx.lineWidth=2;ctx.setLineDash([6,4]);
      ctx.strokeRect(rx,ry,rw,rh);ctx.setLineDash([]);
      // Dimensions label
      ctx.fillStyle="#22D3EEEE";ctx.font="bold 11px monospace";
      ctx.fillText(`${Math.abs(Math.round(cropRect.w))}×${Math.abs(Math.round(cropRect.h))}`,rx+4,ry+14);
    }

    if(tool===TOOLS.CALIB){ctx.fillStyle="#F59E0B08";ctx.fillRect(0,0,imgW*sc,imgH*sc);}
    ctx.restore();
  },[grayData,imgW,imgH,contrast,brightness,lanes,activeLane,laneWidth,yStart,yEnd,imgZoom,imgPan,dScale,tool,calibLane,mwAssign,cmapLUT,hoverY,getMWatY,rfCurvesFitted,activeRfCurve,annotations,cropRect]);

  // ── Mouse on gel ──
  const handleGelDown=useCallback(e=>{
    if(!grayData)return;const c=getPixel(e);if(!c)return;
    if(tool===TOOLS.SELECT){
      const{idx,handle}=findNearLane(c.px,c.py);
      if(idx>=0){setDraggingLane(idx);setDraggingHandle(handle);setActiveLane(idx);return;}
      setIsPanning(true);setPanStart({x:e.clientX-imgPan.x,y:e.clientY-imgPan.y});
    }
    else if(tool===TOOLS.ADD_LANE){if(c.px>=0&&c.px<imgW){setLanes(p=>[...p,{xTop:c.px,xBot:c.px}]);setActiveLane(lanes.length);}}
    else if(tool===TOOLS.CALIB){if(calibClickIdx<mwAssign.length&&c.py>=0&&c.py<imgH){setMwAssign(p=>{const n=[...p];n[calibClickIdx]={...n[calibClickIdx],yPos:c.py,auto:false};return n;});let next=calibClickIdx+1;if(next>=mwAssign.length){setTool(TOOLS.SELECT);next=0;}setCalibClickIdx(next);}}
    else if(tool===TOOLS.CURVATURE){
      if(c.px>=0&&c.px<imgW&&c.py>=0&&c.py<imgH){
        if(activeRfCurve!==null&&activeRfCurve<rfCurves.length){
          // Add point to active curve
          setRfCurves(p=>{const n=[...p];n[activeRfCurve]={...n[activeRfCurve],points:[...n[activeRfCurve].points,{x:c.px,y:c.py}]};return n;});
        }else{
          // Create new curve with this first point
          const newCurve={id:rfIdCounter.current++,points:[{x:c.px,y:c.py}]};
          setRfCurves(p=>[...p,newCurve]);
          setActiveRfCurve(rfCurves.length);
        }
      }
    }
    else if(tool===TOOLS.CROP){
      if(c.px>=0&&c.px<imgW&&c.py>=0&&c.py<imgH){
        setCropStart({x:c.px,y:c.py});
        setCropRect({x:c.px,y:c.py,w:0,h:0});
      }
    }
    else if(tool===TOOLS.ANNOTATE){
      if(c.px>=0&&c.px<imgW&&c.py>=0&&c.py<imgH){
        const text=window.prompt("Texte de l'annotation:","");
        if(text&&text.trim()){
          const id=annotIdCounter.current++;
          setAnnotations(p=>[...p,{id,x:c.px,y:c.py,text:text.trim(),color:annotColor}]);
        }
      }
    }
  },[grayData,tool,getPixel,findNearLane,imgPan,lanes.length,calibClickIdx,mwAssign,imgW,imgH,activeRfCurve,rfCurves.length,annotColor]);
  const handleGelMove=useCallback(e=>{
    if(!grayData)return;
    if(isPanning){setImgPan({x:e.clientX-panStart.x,y:e.clientY-panStart.y});return;}
    if(tool===TOOLS.CROP&&cropStart){
      const c=getPixel(e);
      if(c){setCropRect({x:cropStart.x,y:cropStart.y,w:c.px-cropStart.x,h:c.py-cropStart.y});}
      return;
    }
    if(draggingLane!==null){
      const c=getPixel(e);
      if(c){
        const nx=Math.max(0,Math.min(imgW-1,c.px));
        setLanes(p=>{const n=[...p];const l={...n[draggingLane]};
          if(draggingHandle==="top") l.xTop=nx;
          else if(draggingHandle==="bot") l.xBot=nx;
          else{const dx=nx-Math.round((l.xTop+l.xBot)/2);l.xTop=Math.max(0,Math.min(imgW-1,l.xTop+dx));l.xBot=Math.max(0,Math.min(imgW-1,l.xBot+dx));}
          n[draggingLane]=l;return n;
        });
      }
    }
  },[grayData,isPanning,panStart,draggingLane,draggingHandle,getPixel,imgW,tool,cropStart]);
  const handleGelUp=useCallback(()=>{setIsPanning(false);setDraggingLane(null);setDraggingHandle(null);setCropStart(null);},[]);
  const handleGelWheel=useCallback(e=>{if(!grayData)return;e.preventDefault();const r=gelRef.current.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;const f=e.deltaY<0?1.15:1/1.15;const nz=Math.max(0.2,Math.min(20,imgZoom*f));const ratio=nz/imgZoom;setImgPan(p=>({x:mx-(mx-p.x)*ratio,y:my-(my-p.y)*ratio}));setImgZoom(nz);},[grayData,imgZoom]);
  const gelCursor=useMemo(()=>{if(tool===TOOLS.ADD_LANE||tool===TOOLS.CALIB||tool===TOOLS.CURVATURE||tool===TOOLS.CROP)return"crosshair";if(tool===TOOLS.ANNOTATE)return"text";if(draggingLane!==null)return"ew-resize";if(isPanning)return"grabbing";return"grab";},[tool,draggingLane,isPanning]);

  // ── Panel resize ──
  const handleResizeDown=useCallback((e)=>{
    e.preventDefault();setIsResizingPanel(true);
    const startX=e.clientX,startW=rightPanelW;
    const onMove=(ev)=>{
      const dx=startX-ev.clientX;
      setRightPanelW(Math.max(350,Math.min(900,startW+dx)));
    };
    const onUp=()=>{setIsResizingPanel(false);window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  },[rightPanelW]);

  // ── Profiles (with tilt + Rf curve correction) ──
  const laneProfiles=useMemo(()=>{
    if(!grayData||!lanes.length)return[];
    const adj=new Float64Array(grayData.length);
    for(let i=0;i<grayData.length;i++)adj[i]=Math.max(0,Math.min(255,(grayData[i]-128)*contrast+128+(brightness-1)*128));
    const hasRf=rfEnabled&&rfCurvesFitted.length>=2;
    return lanes.map(l=>{
      const hw=Math.floor(laneWidth/2);
      const p=new Float64Array(imgH);
      const yRange=yEnd-yStart||1;
      for(let y=0;y<imgH;y++){
        // Tilt interpolation
        const frac=Math.max(0,Math.min(1,(y-yStart)/yRange));
        const lx=Math.round(l.xTop+(l.xBot-l.xTop)*frac);
        // Rf curve dewarp
        const srcY=hasRf?Math.round(dewarpY(lx,y)):y;
        if(srcY<0||srcY>=imgH){p[y]=0;continue;}
        const x0=Math.max(0,lx-hw),x1=Math.min(imgW-1,lx+hw);
        let s=0,cnt=0;
        for(let x=x0;x<=x1;x++){s+=adj[srcY*imgW+x];cnt++;}
        p[y]=cnt>0?255-s/cnt:0;
      }
      return p;
    });
  },[grayData,lanes,imgW,imgH,laneWidth,contrast,brightness,rfEnabled,rfCurvesFitted,dewarpY,yStart,yEnd]);
  const croppedProfiles=useMemo(()=>laneProfiles.map(p=>smooth(p.slice(yStart,yEnd+1),9)),[laneProfiles,yStart,yEnd]);
  const activePeaks=useMemo(()=>{if(activeLane===null||!croppedProfiles[activeLane])return[];return findPeaks(croppedProfiles[activeLane],prominence,minPeakDist);},[croppedProfiles,activeLane,prominence,minPeakDist]);

  // ── Baseline for active lane ──
  const activeBaseline=useMemo(()=>{
    if(activeLane===null||!croppedProfiles[activeLane]||baselineMode==="none")return null;
    const prof=croppedProfiles[activeLane];
    if(baselineMode==="rollingball") return rollingBallBaseline(prof,rbRadius);
    if(baselineMode==="valley") return valleyBaseline(prof);
    return null;
  },[croppedProfiles,activeLane,baselineMode,rbRadius]);

  const peakAreas=useMemo(()=>{
    if(!activePeaks.length||activeLane===null||!croppedProfiles[activeLane])return[];
    return computePeakAreas(croppedProfiles[activeLane],activePeaks,activeBaseline);
  },[activePeaks,croppedProfiles,activeLane,activeBaseline]);
  const totalArea=useMemo(()=>peakAreas.reduce((s,p)=>s+p.area,0),[peakAreas]);
  const peaksMW=useMemo(()=>{if(!calibration||!peakAreas.length)return[];const{slope,intercept,top,bot,isPoly,a,b,c}=calibration;return peakAreas.map(p=>{const rf=(p.pos+yStart-top)/(bot-top);const logMw=isPoly?(a*rf*rf+b*rf+c):(slope*rf+intercept);return{...p,rf,mw:Math.pow(10,logMw)};});},[calibration,peakAreas,yStart]);
  useEffect(()=>{setChartZoom({xMin:0,xMax:1});},[lanes.length,yStart,yEnd,activeLane]);

  const exportCSV=useCallback(()=>{if(activeLane===null||!croppedProfiles[activeLane])return;const prof=croppedProfiles[activeLane];let csv="Position_Y,Intensite\n";for(let i=0;i<prof.length;i++)csv+=`${i+yStart},${prof[i].toFixed(2)}\n`;if(activePeaks.length){csv+="\nPic_Y,Intensite,Prominence,Aire,Pct";if(calibration)csv+=",Rf,MW_kDa,Mol_Rel,Ratio";csv+="\n";const moles=calibration&&peaksMW.length?peaksMW.map((p,i)=>{const a=peakAreas[i]?.area||0;return a/p.mw;}):[]; const minMol=moles.length?Math.min(...moles.filter(m=>m>0)):1;activePeaks.forEach((p,i)=>{const pa=peakAreas[i];const pct=totalArea>0&&pa?(pa.area/totalArea*100):0;csv+=`${p.pos+yStart},${p.intensity.toFixed(2)},${p.prominence.toFixed(2)},${pa?pa.area.toFixed(1):""},${pct.toFixed(2)}`;if(calibration&&peaksMW[i]){const mol=moles[i]||0;csv+=`,${peaksMW[i].rf.toFixed(4)},${peaksMW[i].mw.toFixed(1)},${mol.toFixed(2)},${minMol>0?(mol/minMol).toFixed(2):""}`;}csv+="\n";});}const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`lane_${activeLane+1}.csv`;document.body.appendChild(a);a.click();document.body.removeChild(a);},[activeLane,croppedProfiles,activePeaks,peakAreas,totalArea,yStart,calibration,peaksMW]);

  // ── SVG chart ──
  const CW=540,CH=310,PAD={t:20,r:18,b:36,l:50};
  const cpw=CW-PAD.l-PAD.r,cph=CH-PAD.t-PAD.b;

  // Chart hover → compute hoverY
  const handleChartHover=useCallback((e)=>{
    const svg=chartSvgRef.current;if(!svg||!croppedProfiles.length)return;
    const rect=svg.getBoundingClientRect();
    const mx=(e.clientX-rect.left)/rect.width*CW;
    // Convert SVG x to profile index
    const profs=activeTab==="compare"?croppedProfiles:(activeLane!==null&&croppedProfiles[activeLane]?[croppedProfiles[activeLane]]:[]);
    if(!profs.length||!profs[0])return;
    const n=profs[0].length;
    const{xMin,xMax}=chartZoom;
    const vxs=Math.floor(xMin*n),vxe=Math.ceil(xMax*n);
    // mx is in SVG coords → convert to profile index
    const fracX=(mx-PAD.l)/cpw;
    if(fracX<0||fracX>1){setHoverY(null);return;}
    const idx=Math.round(vxs+fracX*(vxe-vxs));
    const absY=idx+yStart;
    if(absY>=yStart&&absY<=yEnd) setHoverY(absY);
    else setHoverY(null);
  },[croppedProfiles,activeTab,activeLane,chartZoom,yStart,yEnd]);

  const handleChartLeave=useCallback(()=>{setHoverY(null);},[]);

  const renderProfile=()=>{
    if(!lanes.length||!croppedProfiles.length)return null;
    let profs,indices;
    if(activeTab==="compare"){indices=[...compareLanes].filter(i=>i<croppedProfiles.length).sort((a,b)=>a-b);profs=indices.map(i=>croppedProfiles[i]);}
    else{if(activeLane===null||!croppedProfiles[activeLane])return null;indices=[activeLane];profs=[croppedProfiles[activeLane]];}
    if(!profs.length||!profs[0])return null;
    const n=profs[0].length;
    let maxY=1;profs.forEach(p=>{for(let i=0;i<p.length;i++)if(p[i]>maxY)maxY=p[i];});maxY*=1.1;
    const{xMin,xMax}=chartZoom;
    const vxs=Math.floor(xMin*n),vxe=Math.ceil(xMax*n);
    const xS=i=>PAD.l+((i-vxs)/Math.max(1,vxe-vxs))*cpw;
    const yS=v=>PAD.t+cph-(v/maxY)*cph;

    const grid=[];
    for(let t=0;t<=5;t++){const val=(maxY/5)*t,y=yS(val);grid.push(<line key={`g${t}`} x1={PAD.l} x2={CW-PAD.r} y1={y} y2={y} stroke="#1E293B"/>);grid.push(<text key={`gt${t}`} x={PAD.l-6} y={y+3} textAnchor="end" fill="#64748B" fontSize={8} fontFamily="monospace">{val.toFixed(0)}</text>);}
    const xStep=Math.max(1,Math.floor((vxe-vxs)/7));const xt=[];
    for(let i=vxs;i<vxe;i+=xStep){const x=xS(i);if(x>=PAD.l&&x<=CW-PAD.r)xt.push(<text key={`x${i}`} x={x} y={CH-10} textAnchor="middle" fill="#64748B" fontSize={8} fontFamily="monospace">{i+yStart}</text>);}

    const paths=profs.map((prof,pi)=>{
      const idx=indices[pi];const col=COLORS[idx%10];
      let d="",first=true;for(let i=vxs;i<Math.min(vxe,prof.length);i++){d+=(first?"M":"L")+`${xS(i).toFixed(1)},${yS(prof[i]).toFixed(1)}`;first=false;}
      if(!d)return null;const li=Math.min(vxe,prof.length)-1;
      const fd=d+`L${xS(li).toFixed(1)},${yS(0)}L${xS(vxs)},${yS(0)}Z`;
      return <g key={pi}><path d={fd} fill={col+"15"} clipPath="url(#cc)"/><path d={d} fill="none" stroke={col} strokeWidth={1.8} clipPath="url(#cc)"/></g>;
    });

    const marks=(activeTab==="profile"&&activeLane!==null)?activePeaks.map((p,i)=>{
      const x=xS(p.pos),y=yS(p.intensity);if(x<PAD.l||x>CW-PAD.r)return null;
      const lbl=peaksMW[i]?`${peaksMW[i].mw.toFixed(0)}`:`${p.pos+yStart}`;
      const pct=totalArea>0&&peakAreas[i]?(peakAreas[i].area/totalArea*100).toFixed(1)+"%":"";
      // Clamp label positions so they stay visible even when peak saturates at top
      const lblY=Math.max(PAD.t+18,y-9);
      const pctY=Math.max(PAD.t+9,y-20);
      const dotY=Math.max(PAD.t+2,Math.min(PAD.t+cph,y));
      return <g key={`p${i}`}><circle cx={x} cy={dotY} r={4} fill="#EF4444" stroke="#0F172A" strokeWidth={2}/><text x={x} y={lblY} textAnchor="middle" fill="#F87171" fontSize={8} fontWeight="bold" fontFamily="monospace">{lbl}{peaksMW[i]?" kDa":""}</text>{pct&&<text x={x} y={pctY} textAnchor="middle" fill="#22D3EE" fontSize={7} fontFamily="monospace">{pct}</text>}</g>;
    }):null;

    // ── Peak area fills ──
    const areaFills=(activeTab==="profile"&&activeLane!==null&&peakAreas.length>0)?peakAreas.map((pk,i)=>{
      const prof=profs[0];if(!prof)return null;
      const{left,right}=pk;
      // Build path: top=profile, bottom=baseline (or 0 if no baseline)
      const bl=activeBaseline;
      let d=`M${xS(left).toFixed(1)},${yS(bl?bl[left]:0).toFixed(1)}`;
      for(let j=left;j<=right;j++){
        if(j>=0&&j<prof.length) d+=`L${xS(j).toFixed(1)},${yS(prof[j]).toFixed(1)}`;
      }
      d+=`L${xS(right).toFixed(1)},${yS(bl?bl[right]:0).toFixed(1)}`;
      // Close along baseline
      if(bl){for(let j=right;j>=left;j--)d+=`L${xS(j).toFixed(1)},${yS(bl[j]||0).toFixed(1)}`;}
      d+="Z";
      const col=COLORS[i%10];
      return <path key={`af${i}`} d={d} fill={col+"30"} stroke={col+"60"} strokeWidth={0.5} clipPath="url(#cc)"/>;
    }):null;

    // ── Baseline line on chart ──
    let baselinePath=null;
    if(activeTab==="profile"&&showBaseline&&activeBaseline&&activeLane!==null){
      let bd="";
      for(let i=vxs;i<Math.min(vxe,activeBaseline.length);i++){
        bd+=(i===vxs?"M":"L")+`${xS(i).toFixed(1)},${yS(activeBaseline[i]).toFixed(1)}`;
      }
      baselinePath=<path d={bd} fill="none" stroke="#F59E0B80" strokeWidth={1.5} strokeDasharray="4,3" clipPath="url(#cc)"/>;
    }

    // ── Crosshair at hoverY ──
    let crosshair=null;
    if(hoverY!==null){
      const hi=hoverY-yStart; // index in cropped profile
      if(hi>=vxs&&hi<vxe){
        const cx=xS(hi);
        const mwAtH=getMWatY(hoverY);
        // Gather intensity values at this position for displayed profiles
        const intVals=profs.map((prof,pi)=>{
          const val=hi>=0&&hi<prof.length?prof[hi]:0;
          return{idx:indices[pi],val};
        });
        // Tooltip lines
        const tipLines=[`Y: ${hoverY} px`];
        if(mwAtH)tipLines.push(`≈ ${mwAtH.toFixed(1)} kDa`);
        intVals.forEach(iv=>tipLines.push(`L${iv.idx+1}: ${iv.val.toFixed(0)}`));

        const tipW=110,tipLineH=13,tipH=tipLines.length*tipLineH+8;
        const tipX=cx+12>CW-PAD.r-tipW?cx-tipW-8:cx+12;
        const tipY=PAD.t+10;

        crosshair=(
          <g>
            <line x1={cx} x2={cx} y1={PAD.t} y2={PAD.t+cph} stroke="#FF6B6B" strokeWidth={1} strokeDasharray="4,3" clipPath="url(#cc)"/>
            {/* Intensity dots */}
            {intVals.map((iv,i)=>{
              const prof=profs[i];
              if(hi<0||hi>=prof.length)return null;
              const dy=yS(prof[hi]);
              return <circle key={`hd${i}`} cx={cx} cy={dy} r={3.5} fill={COLORS[iv.idx%10]} stroke="#0F172A" strokeWidth={1.5}/>;
            })}
            {/* Tooltip box */}
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4} fill="#0F172AEE" stroke="#334155" strokeWidth={1}/>
            {tipLines.map((line,i)=>(
              <text key={`tt${i}`} x={tipX+8} y={tipY+13+i*tipLineH} fill={i===0?"#FF6B6B":i===1&&mwAtH?"#FCD34D":"#94A3B8"} fontSize={9} fontWeight={i<2?700:400} fontFamily="monospace">{line}</text>
            ))}
          </g>
        );
      }
    }

    return(
      <svg ref={chartSvgRef} width="100%" viewBox={`0 0 ${CW} ${CH}`}
        style={{background:"#0F172A",borderRadius:8,cursor:chartPanning?"grabbing":"crosshair",userSelect:"none"}}
        onWheel={handleChartWheel} onMouseDown={handleChartDown} onMouseMove={(e)=>{handleChartMove(e);handleChartHover(e);}} onMouseUp={handleChartUp} onMouseLeave={(e)=>{handleChartUp();handleChartLeave();}}>
        <defs><clipPath id="cc"><rect x={PAD.l} y={PAD.t} width={cpw} height={cph}/></clipPath></defs>
        <rect x={PAD.l} y={PAD.t} width={cpw} height={cph} fill="none" stroke="#1E293B"/>
        {/* Invisible rect to capture mouse events over full chart area */}
        <rect x={PAD.l} y={PAD.t} width={cpw} height={cph} fill="transparent"/>
        {grid}{xt}{baselinePath}{areaFills}{paths}{marks}{crosshair}
        <text x={CW/2} y={CH-1} textAnchor="middle" fill="#94A3B8" fontSize={9} fontFamily="monospace">Position Y (px)</text>
        <text x={12} y={CH/2} textAnchor="middle" fill="#94A3B8" fontSize={9} fontFamily="monospace" transform={`rotate(-90,12,${CH/2})`}>Intensité</text>
      </svg>
    );
  };

  const handleChartWheel=useCallback(e=>{e.preventDefault();e.stopPropagation();const svg=chartSvgRef.current;if(!svg)return;const r=svg.getBoundingClientRect();const mx=(e.clientX-r.left)/r.width;const f=e.deltaY<0?0.85:1.18;setChartZoom(p=>{const range=p.xMax-p.xMin;const nr=Math.min(1,Math.max(0.01,range*f));const ctr=p.xMin+mx*range;let mn=ctr-mx*nr,mx2=ctr+(1-mx)*nr;if(mn<0){mx2-=mn;mn=0;}if(mx2>1){mn-=(mx2-1);mx2=1;}return{xMin:Math.max(0,mn),xMax:Math.min(1,mx2)};});},[]);
  const handleChartDown=useCallback(e=>{const svg=chartSvgRef.current;if(!svg)return;setChartPanning(true);setChartPanStart({x:e.clientX,zoom:{...chartZoom},w:svg.getBoundingClientRect().width});},[chartZoom]);
  const handleChartMove=useCallback(e=>{if(!chartPanning||!chartPanStart)return;const dx=e.clientX-chartPanStart.x;const range=chartPanStart.zoom.xMax-chartPanStart.zoom.xMin;const shift=-(dx/chartPanStart.w)*range;let mn=chartPanStart.zoom.xMin+shift,mx=chartPanStart.zoom.xMax+shift;if(mn<0){mx-=mn;mn=0;}if(mx>1){mn-=(mx-1);mx=1;}setChartZoom({xMin:Math.max(0,mn),xMax:Math.min(1,mx)});},[chartPanning,chartPanStart]);
  const handleChartUp=useCallback(()=>{setChartPanning(false);setChartPanStart(null);},[]);

  const renderCalibChart=()=>{
    if(!calibration)return <p style={{color:"#64748B",fontSize:11,textAlign:"center",padding:14}}>Assignez ≥ 2 positions.</p>;
    const{slope,intercept,r2,rfs,logMws,markers:mk,isPoly,a,b,c}=calibration;
    const W=480,H=240,CP={t:18,r:16,b:32,l:46};
    const w2=W-CP.l-CP.r,h2=H-CP.t-CP.b;
    const lMin=Math.min(...logMws)-0.2,lMax=Math.max(...logMws)+0.2;
    const sx=v=>CP.l+v*w2,sy=v=>CP.t+h2-((v-lMin)/(lMax-lMin))*h2;
    // Fitted curve path (works for both linear and polynomial)
    let curvePath="";
    for(let i=0;i<=100;i++){
      const rf=i/100;
      const logMw=isPoly?(a*rf*rf+b*rf+c):(slope*rf+intercept);
      const px=sx(rf),py=sy(logMw);
      curvePath+=(i===0?"M":"L")+`${px.toFixed(1)},${py.toFixed(1)}`;
    }
    return(
      <svg ref={calibChartRef} width="100%" viewBox={`0 0 ${W} ${H}`} style={{background:"#0F172A",borderRadius:8}}>
        <path d={curvePath} fill="none" stroke="#F59E0B" strokeWidth={2} strokeDasharray="6,3"/>
        {rfs.map((rf,i)=><g key={i}>
          <circle cx={sx(rf)} cy={sy(logMws[i])} r={5} fill="#10B981" stroke="#0F172A" strokeWidth={2}/>
          <text x={sx(rf)+8} y={sy(logMws[i])+3} fill="#6EE7B7" fontSize={8} fontFamily="monospace">{mk[i].mw} kDa</text>
        </g>)}
        <text x={W-CP.r-4} y={CP.t+12} textAnchor="end" fill="#F59E0B" fontSize={10} fontWeight="bold" fontFamily="monospace">R²={r2.toFixed(4)} {isPoly?"(poly)":"(lin)"}</text>
      </svg>
    );
  };

  // ── Export chart as image ──
  const exportChart=useCallback((format)=>{
    const svg=activeTab==="calibration"?calibChartRef.current:chartSvgRef.current;
    if(!svg)return;
    const vb=svg.viewBox?.baseVal;
    const svgW=vb?.width||CW,svgH=vb?.height||CH;
    const scale=3;
    const w=svgW*scale,h=svgH*scale;
    // Clone and fix for serialization
    const clone=svg.cloneNode(true);
    clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
    clone.setAttribute("width",w);
    clone.setAttribute("height",h);
    // Inline the background as a rect (style.background doesn't serialize)
    const bgRect=document.createElementNS("http://www.w3.org/2000/svg","rect");
    bgRect.setAttribute("width","100%");bgRect.setAttribute("height","100%");
    bgRect.setAttribute("fill","#0F172A");
    clone.insertBefore(bgRect,clone.firstChild);
    const xml=new XMLSerializer().serializeToString(clone);
    // Use data URL (works in sandboxed iframes, unlike blob URLs)
    const dataUrl="data:image/svg+xml;base64,"+btoa(unescape(encodeURIComponent(xml)));
    const img=document.createElement("img");
    img.onerror=()=>{ console.warn("SVG render failed"); };
    img.onload=()=>{
      const cvs=document.createElement("canvas");cvs.width=w;cvs.height=h;
      const ctx=cvs.getContext("2d");
      ctx.fillStyle="#0F172A";ctx.fillRect(0,0,w,h);
      ctx.drawImage(img,0,0,w,h);
      // Use toDataURL fallback (toBlob can fail in some sandboxes)
      try{
        const mime=format==="jpg"?"image/jpeg":"image/png";
        const dataUri=cvs.toDataURL(mime,format==="jpg"?0.95:undefined);
        const a=document.createElement("a");
        const tabName=activeTab==="calibration"?"calibration":activeTab==="compare"?"compare":activeLane!==null?`lane${activeLane+1}`:"chart";
        a.download=`sds-page_${tabName}.${format==="jpg"?"jpg":"png"}`;
        a.href=dataUri;
        document.body.appendChild(a);a.click();document.body.removeChild(a);
      }catch(e){console.warn("Export failed:",e);}
    };
    img.src=dataUrl;
  },[activeTab,activeLane]);

  // ── Export gel image ──
  const exportGelImage=useCallback((format)=>{
    const canvas=gelRef.current;
    if(!canvas)return;
    try{
      const mime=format==="jpg"?"image/jpeg":"image/png";
      const dataUri=canvas.toDataURL(mime,format==="jpg"?0.95:undefined);
      const a=document.createElement("a");
      a.download=`sds-page_gel.${format==="jpg"?"jpg":"png"}`;
      a.href=dataUri;
      document.body.appendChild(a);a.click();document.body.removeChild(a);
    }catch(e){console.warn("Gel export failed:",e);}
  },[]);

  const removeLane=idx=>{setLanes(p=>p.filter((_,i)=>i!==idx));if(calibLane===idx)setCalibLane(null);else if(calibLane>idx)setCalibLane(calibLane-1);if(activeLane===idx)setActiveLane(lanes.length>1?0:null);else if(activeLane>idx)setActiveLane(activeLane-1);setCompareLanes(prev=>{const n=new Set();prev.forEach(v=>{if(v<idx)n.add(v);else if(v>idx)n.add(v-1);});return n;});};
  const toggleCompareLane=idx=>{setCompareLanes(prev=>{const n=new Set(prev);if(n.has(idx))n.delete(idx);else n.add(idx);return n;});};
  const cmapPreview=name=>{const lut=makeColormap(name);const w=60,h=8;let s=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;for(let i=0;i<w;i++){const ci=Math.round((i/w)*255)*3;s+=`<rect x="${i}" y="0" width="1" height="${h}" fill="rgb(${lut[ci]},${lut[ci+1]},${lut[ci+2]})"/>`;}s+=`</svg>`;return `data:image/svg+xml,${encodeURIComponent(s)}`;};

  const S={
    app:{fontFamily:"'Menlo','Monaco','Courier New',monospace",background:"#080C18",color:"#E2E8F0",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"},
    hdr:{background:"#0F172A",borderBottom:"1px solid #1E293B",padding:"6px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0},
    logB:{display:"flex",alignItems:"center",gap:8,flexShrink:0},
    logI:{width:24,height:24,borderRadius:5,background:"linear-gradient(135deg,#3B82F6,#06B6D4)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12},
    logT:{fontSize:13,fontWeight:700,background:"linear-gradient(90deg,#60A5FA,#22D3EE)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",whiteSpace:"nowrap"},
    toolbar:{display:"flex",gap:2,background:"#1E293B50",borderRadius:6,padding:2},
    toolBtn:(a,c="#94A3B8")=>({padding:"5px 10px",borderRadius:4,border:"none",background:a?"#334155":"transparent",color:a?"#E2E8F0":c,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}),
    body:{display:"flex",flex:1,overflow:"hidden"},
    side:{width:250,flexShrink:0,background:"#0F172A",borderRight:"1px solid #1E293B",overflow:"auto",padding:"8px 7px",display:"flex",flexDirection:"column",gap:8,fontSize:10},
    sec:{background:"#1E293B25",borderRadius:6,padding:"6px 7px"},
    lbl:{fontSize:8,fontWeight:700,color:"#64748B",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4},
    sld:{width:"100%",accentColor:"#3B82F6",cursor:"pointer"},
    btn:(a,c="#3B82F6")=>({padding:"4px 9px",borderRadius:4,border:`1px solid ${a?c:"#334155"}`,background:a?c+"20":"#0F172A",color:a?c:"#94A3B8",fontSize:9,fontWeight:600,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}),
    btnS:(a,c="#3B82F6")=>({padding:"2px 6px",borderRadius:3,border:`1px solid ${a?c:"#334155"}`,background:a?c+"20":"transparent",color:a?c:"#94A3B8",fontSize:8,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}),
    main:{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"},
    ws:{flex:1,display:"flex",overflow:"hidden"},
    gelP:{flex:1,overflow:"hidden",position:"relative",background:"#060A14"},
    chtP:{width:rightPanelW,flexShrink:0,borderLeft:"1px solid #1E293B",overflow:"hidden",background:"#0B1022",display:"flex",flexDirection:"column"},
    tab:a=>({padding:"4px 11px",borderRadius:4,background:a?"#1E293B":"transparent",color:a?"#E2E8F0":"#64748B",fontSize:9,fontWeight:600,cursor:"pointer",border:"none",fontFamily:"inherit"}),
    mini:{width:44,padding:"2px 3px",borderRadius:3,border:"1px solid #334155",background:"#0F172A",color:"#E2E8F0",fontSize:9,fontFamily:"inherit",outline:"none"},
    th:{padding:"3px 4px",textAlign:"left",color:"#64748B",borderBottom:"1px solid #1E293B",fontWeight:600,fontSize:8},
    td:{padding:"3px 4px",borderBottom:"1px solid #1E293B15",color:"#CBD5E1",fontSize:8},
    info:{background:"#0F172A",borderTop:"1px solid #1E293B",padding:"3px 12px",display:"flex",alignItems:"center",gap:10,fontSize:8,color:"#64748B",flexShrink:0},
    empty:{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12},
    drop:{width:260,height:160,borderRadius:10,border:"2px dashed #334155",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer",background:"#0F172A40"},
    banner:c=>({position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",zIndex:10,padding:"4px 14px",borderRadius:5,background:c+"20",border:"1px solid "+c+"40",fontSize:10,color:c,whiteSpace:"nowrap",pointerEvents:"none"}),
    zoomBadge:{position:"absolute",bottom:8,right:8,zIndex:10,display:"flex",gap:3,alignItems:"center"},
    select:{padding:"2px 4px",borderRadius:3,border:"1px solid #334155",background:"#0F172A",color:"#E2E8F0",fontSize:9,fontFamily:"inherit",outline:"none",cursor:"pointer"},
    cmapBtn:a=>({display:"flex",alignItems:"center",gap:5,padding:"3px 6px",borderRadius:4,cursor:"pointer",border:`1px solid ${a?"#60A5FA40":"#334155"}`,background:a?"#3B82F620":"transparent"}),
  };

  return(
    <div style={S.app}>
      <div style={S.hdr}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={S.logB}><div style={S.logI}>⚗</div><span style={S.logT}>SDS-PAGE Analyzer</span></div>
          {grayData&&<div style={S.toolbar}>
            <button style={S.toolBtn(tool===TOOLS.SELECT)} onClick={()=>setTool(TOOLS.SELECT)}>◎ Sélection</button>
            <button style={S.toolBtn(tool===TOOLS.ADD_LANE,"#10B981")} onClick={()=>setTool(TOOLS.ADD_LANE)}>┃ Piste</button>
            <button style={S.toolBtn(tool===TOOLS.CURVATURE,"#FF61DC")} onClick={()=>setTool(TOOLS.CURVATURE)}>∿ Courbure</button>
            <button style={S.toolBtn(tool===TOOLS.CROP,"#22D3EE")} onClick={()=>setTool(tool===TOOLS.CROP?TOOLS.SELECT:TOOLS.CROP)}>⛶ Rogner</button>
            <button style={S.toolBtn(tool===TOOLS.ANNOTATE,"#FBBF24")} onClick={()=>setTool(tool===TOOLS.ANNOTATE?TOOLS.SELECT:TOOLS.ANNOTATE)}>✎ Annoter</button>
          </div>}
        </div>
        <div style={{display:"flex",gap:4,alignItems:"center"}}>
          {grayData&&<button style={S.btn(false,"#F59E0B")} onClick={exportCSV}>↓ CSV</button>}
          <button style={S.btn(false)} onClick={()=>fileRef.current?.click()}>📂 {grayData?"Changer":"Ouvrir"}</button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/tiff,image/bmp,image/gif,.tif,.tiff,.png,.jpg,.jpeg,.bmp,.gif" onChange={handleFileInput} style={{display:"none"}}/>
        </div>
      </div>
      {errMsg&&<div style={{padding:"4px 14px",background:"#7F1D1D",color:"#FCA5A5",fontSize:10,textAlign:"center"}}>{errMsg}</div>}

      {!grayData?(
        <div style={S.empty}>
          <div style={S.drop} onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();e.stopPropagation();}} onDrop={handleDrop}>
            <div style={{fontSize:32}}>🧬</div>
            <div style={{fontSize:11,fontWeight:600,color:"#94A3B8"}}>Déposez une image de gel</div>
            <div style={{fontSize:9,color:"#475569"}}>PNG · JPG · TIFF · BMP · GIF</div>
          </div>
        </div>
      ):(
        <div style={S.body}>
          <div style={S.side}>
            <div style={S.sec}>
              <div style={S.lbl}>🎨 Image</div>
              {[["Contraste",contrast,setContrast,0.3,3],["Luminosité",brightness,setBrightness,0.3,3]].map(([l,v,set,mn,mx])=>(
                <div key={l} style={{marginBottom:3}}>
                  <div style={{display:"flex",justifyContent:"space-between",color:"#94A3B8",fontSize:8}}><span>{l}</span><span>{v.toFixed(2)}</span></div>
                  <input type="range" min={mn} max={mx} step="0.05" value={v} onChange={e=>set(+e.target.value)} style={S.sld}/>
                </div>
              ))}
              <div style={{marginTop:6}}><div style={{fontSize:8,color:"#94A3B8",marginBottom:4}}>Colorisation</div>
                <div style={{display:"flex",flexDirection:"column",gap:2}}>
                  {COLORMAPS.map(cm=>(<div key={cm} style={S.cmapBtn(colormap===cm)} onClick={()=>setColormap(cm)}><img src={cmapPreview(cm)} width={48} height={8} style={{borderRadius:2,display:"block"}} alt=""/><span style={{fontSize:8,color:colormap===cm?"#60A5FA":"#94A3B8",fontWeight:colormap===cm?700:400}}>{CMAP_LBL[cm]}</span></div>))}
                </div>
              </div>
            </div>

            {/* ── ÉDITION IMAGE ── */}
            <div style={S.sec}>
              <div style={S.lbl}>✂ Édition image</div>
              <div style={{fontSize:7,color:"#F59E0B",marginBottom:4}}>⚠ Réinitialise pistes, courbes & calibration</div>
              {/* Rotate / flip */}
              <div style={{display:"flex",gap:3,marginBottom:4}}>
                <button onClick={()=>applyRotation(-90)} style={{...S.btnS(false,"#8B5CF6"),flex:1}} title="Rotation anti-horaire">⟲ 90°</button>
                <button onClick={()=>applyRotation(90)} style={{...S.btnS(false,"#8B5CF6"),flex:1}} title="Rotation horaire">⟳ 90°</button>
                <button onClick={()=>applyFlip(true)} style={{...S.btnS(false,"#8B5CF6"),flex:1}} title="Miroir horizontal">⇋ H</button>
                <button onClick={()=>applyFlip(false)} style={{...S.btnS(false,"#8B5CF6"),flex:1}} title="Miroir vertical">⇅ V</button>
              </div>
              {/* Crop */}
              <div style={{display:"flex",gap:3,marginBottom:4,alignItems:"center"}}>
                <button onClick={()=>setTool(tool===TOOLS.CROP?TOOLS.SELECT:TOOLS.CROP)} style={S.btnS(tool===TOOLS.CROP,"#22D3EE")}>
                  {tool===TOOLS.CROP?"Tracez la zone...":"⛶ Rogner"}
                </button>
                {cropRect&&Math.abs(cropRect.w)>5&&Math.abs(cropRect.h)>5&&<button onClick={applyCrop} style={S.btnS(false,"#10B981")}>✓ Appliquer</button>}
                {cropRect&&<button onClick={()=>setCropRect(null)} style={S.btnS(false,"#64748B")}>Annuler</button>}
              </div>
              {/* Annotate */}
              <div style={{display:"flex",gap:3,marginBottom:4,alignItems:"center"}}>
                <button onClick={()=>setTool(tool===TOOLS.ANNOTATE?TOOLS.SELECT:TOOLS.ANNOTATE)} style={S.btnS(tool===TOOLS.ANNOTATE,"#FBBF24")}>
                  {tool===TOOLS.ANNOTATE?"Cliquez pour placer":"✎ Annoter"}
                </button>
                <input type="color" value={annotColor} onChange={e=>setAnnotColor(e.target.value)} style={{width:22,height:20,padding:0,border:"1px solid #334155",borderRadius:3,background:"transparent",cursor:"pointer"}} title="Couleur"/>
              </div>
              {annotations.length>0&&<div style={{marginBottom:4}}>
                {annotations.map((a)=>(
                  <div key={a.id} style={{display:"flex",alignItems:"center",gap:4,fontSize:8,padding:"1px 3px"}}>
                    <div style={{width:6,height:6,borderRadius:3,background:a.color,flexShrink:0}}/>
                    <span style={{flex:1,color:"#CBD5E1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.text}</span>
                    <span onClick={()=>setAnnotations(p=>p.filter(x=>x.id!==a.id))} style={{color:"#EF444460",cursor:"pointer",fontSize:9}}>✕</span>
                  </div>
                ))}
              </div>}
              {origGrayData&&<button onClick={resetEdits} style={{...S.btnS(false,"#EF4444"),width:"100%",textAlign:"center",justifyContent:"center"}}>↺ Réinitialiser l'image d'origine</button>}
            </div>

            <div style={S.sec}>
              <div style={S.lbl}>📏 Pistes ({lanes.length})</div>
              <div style={{marginBottom:3}}><div style={{display:"flex",justifyContent:"space-between",color:"#94A3B8",fontSize:8}}><span>Largeur</span><span>{laneWidth}px</span></div><input type="range" min="1" max="100" step="1" value={laneWidth} onChange={e=>setLaneWidth(+e.target.value)} style={S.sld}/></div>
              {lanes.map((l,i)=>(<div key={i} onClick={()=>setActiveLane(i)} style={{display:"flex",alignItems:"center",gap:4,padding:"2px 5px",borderRadius:3,cursor:"pointer",marginBottom:1,background:activeLane===i?"#1E293B":"transparent",border:activeLane===i?`1px solid ${COLORS[i%10]}40`:"1px solid transparent"}}><div style={{width:7,height:7,borderRadius:2,background:COLORS[i%10],flexShrink:0}}/><span style={{flex:1,fontSize:9}}>{calibLane===i&&<span style={{color:"#F59E0B",marginRight:3}}>⚖</span>}L{i+1} <span style={{color:"#64748B"}}>{l.xTop===l.xBot?`x=${l.xTop}`:`${l.xTop}→${l.xBot}`}</span></span><span onClick={e=>{e.stopPropagation();removeLane(i);}} style={{color:"#EF444460",cursor:"pointer",fontSize:10}}>✕</span></div>))}
              {lanes.length>0&&<div style={{fontSize:7,color:"#475569",marginTop:2}}>Glissez haut/bas pour incliner, milieu pour déplacer</div>}
            </div>

            <div style={S.sec}><div style={S.lbl}>✂ Zone Y</div><div style={{display:"flex",gap:3,alignItems:"center",fontSize:9}}><input type="number" value={yStart} min={0} max={imgH-1} onChange={e=>setYStart(Math.max(0,Math.min(yEnd-1,+e.target.value)))} style={S.mini}/><span style={{color:"#64748B"}}>→</span><input type="number" value={yEnd} min={0} max={imgH-1} onChange={e=>setYEnd(Math.max(yStart+1,Math.min(imgH-1,+e.target.value)))} style={S.mini}/></div></div>

            <div style={S.sec}><div style={S.lbl}>🔍 Pics</div>
              {[["Proéminence",prominence,setProminence,1,80],["Distance min",minPeakDist,setMinPeakDist,3,80]].map(([l,v,set,mn,mx])=>(<div key={l} style={{marginBottom:2}}><div style={{display:"flex",justifyContent:"space-between",color:"#94A3B8",fontSize:8}}><span>{l}</span><span>{v}</span></div><input type="range" min={mn} max={mx} step="1" value={v} onChange={e=>set(+e.target.value)} style={S.sld}/></div>))}
            </div>

            {/* ── BASELINE ── */}
            <div style={S.sec}>
              <div style={S.lbl}>📉 Soustraction de fond</div>
              <div style={{display:"flex",gap:3,marginBottom:4}}>
                {BASELINE_MODES.map(m=>(
                  <button key={m} onClick={()=>setBaselineMode(m)} style={{
                    ...S.btnS(baselineMode===m,"#F59E0B"),
                    flex:1,textAlign:"center",justifyContent:"center",
                  }}>{BASELINE_LABELS[m]}</button>
                ))}
              </div>
              {baselineMode==="rollingball"&&(
                <div>
                  <div style={{display:"flex",justifyContent:"space-between",color:"#94A3B8",fontSize:8}}><span>Rayon</span><span>{rbRadius} px</span></div>
                  <input type="range" min="5" max="200" step="1" value={rbRadius} onChange={e=>setRbRadius(+e.target.value)} style={S.sld}/>
                </div>
              )}
              {baselineMode!=="none"&&(
                <div style={{display:"flex",alignItems:"center",gap:4,marginTop:3}}>
                  <span onClick={()=>setShowBaseline(!showBaseline)} style={{
                    cursor:"pointer",width:28,height:14,borderRadius:7,
                    background:showBaseline?"#F59E0B":"#334155",
                    position:"relative",display:"inline-block",transition:"all 0.15s",flexShrink:0,
                  }}><span style={{position:"absolute",top:2,left:showBaseline?14:2,width:10,height:10,borderRadius:5,background:"#fff",transition:"all 0.15s"}}/></span>
                  <span style={{fontSize:8,color:showBaseline?"#F59E0B":"#64748B"}}>Afficher baseline</span>
                </div>
              )}
            </div>

            {/* ── Rf CURVES (distortion correction) ── */}
            <div style={S.sec}>
              <div style={S.lbl}>∿ Correction de distorsion (Courbes Rf)</div>
              <div style={{fontSize:7,color:"#94A3B8",marginBottom:5}}>
                Tracez des courbes le long de bandes identiques (même MW) à travers le gel. Chaque courbe définit une iso-Rf. Minimum 2 courbes pour la correction.
              </div>

              {/* Add / finish curve */}
              <div style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:5}}>
                {tool===TOOLS.CURVATURE&&activeRfCurve!==null?(
                  <button onClick={()=>{setTool(TOOLS.SELECT);setActiveRfCurve(null);}} style={S.btnS(true,"#FF61DC")}>
                    ✓ Terminer courbe Rf{(activeRfCurve??0)+1}
                  </button>
                ):(
                  <button onClick={()=>{
                    setTool(TOOLS.CURVATURE);
                    // Start a new curve
                    const nc={id:rfIdCounter.current++,points:[]};
                    setRfCurves(p=>[...p,nc]);
                    setActiveRfCurve(rfCurves.length);
                  }} style={S.btnS(false,"#FF61DC")}>
                    + Courbe Rf
                  </button>
                )}
                {rfCurves.length>0&&<button onClick={()=>{setRfCurves([]);setActiveRfCurve(null);setTool(TOOLS.SELECT);}} style={S.btnS(false,"#EF4444")}>Tout effacer</button>}
              </div>

              {/* List of curves */}
              {rfCurves.length>0&&<div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:4}}>
                {rfCurves.map((curve,ci)=>{
                  const RF_COL=["#FF61DC","#61DCFF","#DCFF61","#FF9F61","#61FF9F","#9F61FF"];
                  const col=RF_COL[ci%RF_COL.length];
                  const isAct=activeRfCurve===ci;
                  return(
                    <div key={curve.id} style={{display:"flex",alignItems:"center",gap:4,padding:"2px 5px",borderRadius:3,
                      background:isAct?col+"15":"transparent",border:`1px solid ${isAct?col+"50":"transparent"}`,
                    }}>
                      <div style={{width:16,height:3,borderRadius:1,background:col,flexShrink:0}}/>
                      <span style={{fontSize:8,flex:1,color:isAct?"#E2E8F0":"#94A3B8"}}>Rf{ci+1} — {curve.points.length} pts</span>
                      <button onClick={()=>{
                        if(isAct){setActiveRfCurve(null);setTool(TOOLS.SELECT);}
                        else{setActiveRfCurve(ci);setTool(TOOLS.CURVATURE);}
                      }} style={{background:"none",border:"none",color:col,cursor:"pointer",fontSize:8,fontFamily:"inherit",padding:0}}>
                        {isAct?"✓":"✎"}
                      </button>
                      <button onClick={()=>{
                        setRfCurves(p=>p.filter((_,i)=>i!==ci));
                        if(activeRfCurve===ci){setActiveRfCurve(null);setTool(TOOLS.SELECT);}
                        else if(activeRfCurve>ci) setActiveRfCurve(activeRfCurve-1);
                      }} style={{background:"none",border:"none",color:"#EF444460",cursor:"pointer",fontSize:9,fontFamily:"inherit",padding:0}}>✕</button>
                    </div>
                  );
                })}
              </div>}

              {/* Enable/disable + info */}
              {rfCurves.length>=2&&<>
                <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3}}>
                  <span onClick={()=>setRfEnabled(!rfEnabled)} style={{
                    cursor:"pointer",width:28,height:14,borderRadius:7,
                    background:rfEnabled?"#FF61DC":"#334155",
                    position:"relative",display:"inline-block",transition:"all 0.15s",flexShrink:0,
                  }}><span style={{position:"absolute",top:2,left:rfEnabled?14:2,width:10,height:10,borderRadius:5,background:"#fff",transition:"all 0.15s"}}/></span>
                  <span style={{fontSize:8,color:rfEnabled?"#FF61DC":"#64748B"}}>Correction {rfEnabled?"active":"désactivée"}</span>
                </div>
                <div style={{fontSize:7,color:"#94A3B8"}}>{rfCurves.length} courbes Rf · Déformation interpolée par paire</div>
              </>}
              {rfCurves.length===1&&<div style={{fontSize:7,color:"#F59E0B"}}>Ajoutez au moins 1 courbe de plus pour activer la correction</div>}
            </div>

            {/* ── CALIBRATION ── */}
            <div style={S.sec}>
              <div style={S.lbl}>⚖ Calibration MW</div>
              <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:6}}><span style={{fontSize:8,color:"#94A3B8",flexShrink:0}}>Ladder</span><select value={ladderName} onChange={e=>setLadderName(e.target.value)} style={S.select}>{Object.keys(LADDERS).map(k=><option key={k} value={k}>{k}</option>)}</select></div>
              {ladderName==="Custom"&&<div style={{marginBottom:6}}><input value={mwCustom} onChange={e=>setMwCustom(e.target.value)} onBlur={applyCustomMW} onKeyDown={e=>{if(e.key==="Enter")applyCustomMW();}} placeholder="250, 150, 100..." style={{...S.mini,width:"100%",padding:"4px 6px"}}/></div>}
              <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:6}}>{mwList.map((mw,i)=>{const a=mwAssign.find(a=>a.mw===mw&&a.yPos!=="");return <div key={i} style={{padding:"2px 6px",borderRadius:10,fontSize:8,fontWeight:600,background:a?"#F59E0B20":"#1E293B",border:`1px solid ${a?"#F59E0B50":"#334155"}`,color:a?"#FCD34D":"#94A3B8"}}>{mw}{a?" ✓":""}</div>;})}</div>
              <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:6}}><span style={{fontSize:8,color:"#94A3B8",flexShrink:0}}>Piste marqueur</span><select value={calibLane??""} onChange={e=>{setCalibLane(e.target.value===""?null:+e.target.value);setMwAssign([]);}} style={S.select}><option value="">— Choisir —</option>{lanes.map((_,i)=><option key={i} value={i}>L{i+1} (x≈{Math.round((lanes[i].xTop+lanes[i].xBot)/2)})</option>)}</select></div>
              <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:6}}><span style={{fontSize:8,color:"#94A3B8",flexShrink:0}}>Fit MW</span>
                {MW_FIT_MODES.map(m=>(<button key={m} onClick={()=>setMwFitMode(m)} style={S.btnS(mwFitMode===m,"#F59E0B")}>{MW_FIT_LABELS[m]}</button>))}
              </div>
              {calibLane!==null&&<div style={{display:"flex",flexDirection:"column",gap:4}}>
                <div style={{display:"flex",gap:4}}><button onClick={autoAssign} style={{...S.btn(false,"#10B981"),flex:1,justifyContent:"center"}}>⚡ Auto ({calibPeaks.length} pics)</button><button onClick={()=>{setMwAssign(mwList.map(mw=>({mw,yPos:"",auto:false})));setCalibClickIdx(0);setTool(TOOLS.CALIB);}} style={S.btn(tool===TOOLS.CALIB,"#F59E0B")}>✋ Manuel</button></div>
                {mwAssign.length>0&&<div style={{maxHeight:150,overflow:"auto",borderRadius:5,border:"1px solid #1E293B"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={S.th}>MW</th><th style={S.th}>Y</th><th style={S.th}>Statut</th><th style={S.th}></th></tr></thead><tbody>{mwAssign.map((m,i)=>(<tr key={i} style={{background:tool===TOOLS.CALIB&&calibClickIdx===i?"#F59E0B15":(i%2?"#1E293B10":"transparent")}}><td style={{...S.td,color:"#FCD34D",fontWeight:600}}>{m.mw}</td><td style={S.td}>{m.yPos!==""?m.yPos:"—"}</td><td style={S.td}>{m.yPos!==""?<span style={{color:"#10B981",fontSize:8}}>{m.auto?"Auto":"Manuel"}</span>:<span style={{color:"#64748B",fontSize:8}}>—</span>}</td><td style={{...S.td,padding:"2px"}}>{m.yPos!==""&&<span onClick={()=>setMwAssign(p=>{const n=[...p];n[i]={...n[i],yPos:"",auto:false};return n;})} style={{color:"#EF444460",cursor:"pointer",fontSize:9}}>✕</span>}</td></tr>))}</tbody></table></div>}
                {tool===TOOLS.CALIB&&mwAssign.length>0&&<div style={{fontSize:8,color:"#F59E0B",background:"#F59E0B10",padding:"3px 6px",borderRadius:4}}>Cliquez → <strong>{mwAssign[calibClickIdx]?.mw||"?"} kDa</strong> ({calibClickIdx+1}/{mwAssign.length})</div>}
                <div style={{display:"flex",gap:3}}><button onClick={()=>setMwAssign([])} style={S.btnS(false,"#64748B")}>Reset</button>{calibration&&<span style={{fontSize:8,color:"#F59E0B",alignSelf:"center"}}>R² = {calibration.r2.toFixed(4)}</span>}</div>
              </div>}
              {calibLane===null&&lanes.length>0&&<div style={{fontSize:8,color:"#475569",fontStyle:"italic"}}>Choisissez la piste du marqueur</div>}
              {!lanes.length&&<div style={{fontSize:8,color:"#475569",fontStyle:"italic"}}>Ajoutez d'abord des pistes</div>}
            </div>
          </div>

          <div style={S.main}>
            <div style={S.ws}>
              <div ref={gelContainerRef} style={S.gelP}>
                {tool===TOOLS.ADD_LANE&&<div style={S.banner("#10B981")}>Cliquez pour placer une piste</div>}
                {tool===TOOLS.CALIB&&<div style={S.banner("#F59E0B")}>Cliquez la bande {mwAssign[calibClickIdx]?.mw||"?"} kDa</div>}
                {tool===TOOLS.CURVATURE&&<div style={S.banner("#FF61DC")}>Tracez la courbe Rf{(activeRfCurve??0)+1} — cliquez sur la même bande à travers les pistes</div>}
                {tool===TOOLS.CROP&&<div style={S.banner("#22D3EE")}>Tracez un rectangle pour rogner, puis Appliquer</div>}
                {tool===TOOLS.ANNOTATE&&<div style={S.banner("#FBBF24")}>Cliquez pour ajouter une annotation texte</div>}
                <canvas ref={gelRef} onMouseDown={handleGelDown} onMouseMove={handleGelMove} onMouseUp={handleGelUp} onMouseLeave={handleGelUp} onWheel={handleGelWheel} style={{cursor:gelCursor,position:"absolute",top:0,left:0}}/>
                <div style={S.zoomBadge}>
                  <button onClick={()=>exportGelImage("png")} style={S.btnS(false,"#3B82F6")} title="Exporter l'image en PNG">📷</button>
                  <div style={{width:1,height:10,background:"#334155"}}/>
                  <button onClick={()=>setImgZoom(z=>Math.min(20,z*1.3))} style={S.btnS(false,"#64748B")}>+</button>
                  <span style={{fontSize:8,color:"#64748B",minWidth:32,textAlign:"center"}}>{(imgZoom*100).toFixed(0)}%</span>
                  <button onClick={()=>setImgZoom(z=>Math.max(0.2,z/1.3))} style={S.btnS(false,"#64748B")}>−</button>
                  <button onClick={()=>{setImgZoom(1);setImgPan({x:0,y:0});}} style={S.btnS(false,"#64748B")}>⌂</button>
                </div>
              </div>

              {/* RESIZE HANDLE */}
              <div onMouseDown={handleResizeDown} style={{
                width:6,flexShrink:0,cursor:"col-resize",background:isResizingPanel?"#3B82F640":"transparent",
                borderLeft:"1px solid #1E293B",borderRight:"1px solid #1E293B",
                display:"flex",alignItems:"center",justifyContent:"center",
                transition:"background 0.15s",
              }} onMouseEnter={e=>e.currentTarget.style.background="#3B82F620"} onMouseLeave={e=>{if(!isResizingPanel)e.currentTarget.style.background="transparent";}}>
                <div style={{width:2,height:30,borderRadius:1,background:"#334155"}}/>
              </div>

              {/* CHART PANEL */}
              <div style={S.chtP}>
                {/* Tab bar — fixed */}
                <div style={{padding:"8px 10px 0 10px",flexShrink:0}}>
                <div style={{display:"flex",gap:2,alignItems:"center"}}>
                  {[["profile","Profil"],["compare","Comparer"],["calibration","Calibration"]].map(([k,v])=>(<button key={k} style={S.tab(activeTab===k)} onClick={()=>setActiveTab(k)}>{v}</button>))}
                  <div style={{flex:1}}/>
                  {(activeTab==="profile"||activeTab==="compare")&&(chartZoom.xMin>0.001||chartZoom.xMax<0.999)&&<button onClick={()=>setChartZoom({xMin:0,xMax:1})} style={S.btnS(false,"#64748B")}>Reset zoom</button>}
                  <button onClick={()=>exportChart("png")} style={S.btnS(false,"#3B82F6")} title="Exporter en PNG">PNG</button>
                  <button onClick={()=>exportChart("jpg")} style={S.btnS(false,"#3B82F6")} title="Exporter en JPEG">JPG</button>
                </div>
                </div>

                {/* Chart area — stays large */}
                <div style={{flexShrink:0,padding:"4px 10px"}}>

                {(activeTab==="profile"||activeTab==="compare")&&(
                  !lanes.length?<div style={{color:"#475569",fontSize:10,padding:14,textAlign:"center"}}>Ajoutez une piste</div>
                  :<>
                    {activeTab==="compare"&&<div style={{display:"flex",gap:4,flexWrap:"wrap",padding:"4px 0"}}>
                      {lanes.map((_,i)=>{const on=compareLanes.has(i);const col=COLORS[i%10];return(<div key={i} onClick={()=>toggleCompareLane(i)} style={{display:"flex",alignItems:"center",gap:4,padding:"3px 8px",borderRadius:5,cursor:"pointer",background:on?col+"20":"#1E293B30",border:`1px solid ${on?col+"60":"#334155"}`}}><div style={{width:10,height:3,borderRadius:1,background:on?col:"#475569"}}/><span style={{fontSize:9,fontWeight:on?600:400,color:on?"#E2E8F0":"#64748B"}}>L{i+1}</span></div>);})}
                      <div style={{display:"flex",gap:2,marginLeft:4}}><button onClick={()=>setCompareLanes(new Set(lanes.map((_,i)=>i)))} style={S.btnS(false,"#64748B")}>Tous</button><button onClick={()=>setCompareLanes(new Set())} style={S.btnS(false,"#64748B")}>Aucun</button></div>
                    </div>}
                    {renderProfile()}
                    <div style={{fontSize:7,color:"#475569",textAlign:"center"}}>Molette = zoom · Glisser = naviguer · Survol = MW</div>
                  </>
                )}
                {activeTab==="calibration"&&<div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{fontSize:10,color:"#94A3B8"}}>log₁₀(MW) vs Rf</div>
                  {renderCalibChart()}
                </div>}
                </div>

                {/* Data area — scrollable */}
                <div style={{flex:1,overflow:"auto",padding:"0 10px 10px 10px",display:"flex",flexDirection:"column",gap:8}}>
                    {activeTab==="profile"&&activeLane!==null&&activePeaks.length>0&&<div>
                      <div style={{fontSize:9,fontWeight:700,color:"#94A3B8",marginBottom:2}}>Pics — L{activeLane+1} ({activePeaks.length}){totalArea>0&&<span style={{color:"#22D3EE",marginLeft:6}}>Aire totale: {totalArea.toFixed(0)}</span>}</div>
                      <div style={{overflow:"auto",borderRadius:4,border:"1px solid #1E293B"}}><table style={{width:"100%",borderCollapse:"collapse"}}><thead><tr><th style={S.th}>#</th><th style={S.th}>Y</th><th style={S.th}>Int.</th><th style={S.th}>Aire</th><th style={S.th}>%</th>{calibration&&<><th style={S.th}>Rf</th><th style={S.th}>MW</th></>}</tr></thead><tbody>{activePeaks.map((p,i)=>{const pa=peakAreas[i];const pct=totalArea>0&&pa?(pa.area/totalArea*100):0;const pmw=peaksMW[i];return(<tr key={i} style={{background:i%2?"#1E293B10":"transparent"}}><td style={S.td}>{i+1}</td><td style={S.td}>{p.pos+yStart}</td><td style={S.td}>{p.intensity.toFixed(0)}</td><td style={S.td}>{pa?pa.area.toFixed(0):"-"}</td><td style={{...S.td,color:"#22D3EE",fontWeight:600}}>{pct.toFixed(1)}%</td>{calibration&&<td style={S.td}>{pmw?.rf?.toFixed(3)??"-"}</td>}{calibration&&<td style={{...S.td,color:"#F59E0B",fontWeight:700}}>{pmw?.mw?.toFixed(1)??"-"}</td>}</tr>);})}</tbody></table></div>

                      {/* Mini bar chart */}
                      {totalArea>0&&peakAreas.length>0&&(
                        <div style={{marginTop:6}}>
                          <div style={{fontSize:8,fontWeight:700,color:"#94A3B8",marginBottom:3}}>Quantification relative</div>
                          <div style={{display:"flex",flexDirection:"column",gap:2}}>
                            {peakAreas.map((pa,i)=>{
                              const pct=pa.area/totalArea*100;
                              const pmw=peaksMW[i];
                              const label=pmw?`${pmw.mw.toFixed(0)} kDa`:`Pic ${i+1}`;
                              return(
                                <div key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:8}}>
                                  <span style={{width:55,color:"#94A3B8",textAlign:"right",flexShrink:0}}>{label}</span>
                                  <div style={{flex:1,height:12,background:"#1E293B",borderRadius:3,overflow:"hidden",position:"relative"}}>
                                    <div style={{width:pct+"%",height:"100%",background:COLORS[i%10]+"90",borderRadius:3,transition:"width 0.3s"}}/>
                                  </div>
                                  <span style={{width:36,color:"#22D3EE",fontWeight:600,flexShrink:0}}>{pct.toFixed(1)}%</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Stoichiometric ratios (requires calibration for MW) */}
                      {calibration&&peaksMW.length>=2&&totalArea>0&&(()=>{
                        // moles ∝ area / MW (Coomassie staining intensity is proportional to mass)
                        const moles=peaksMW.map((p,i)=>{
                          const a=peakAreas[i]?.area||0;
                          return{mw:p.mw,area:a,mol:a/p.mw,idx:i};
                        }).filter(m=>m.mol>0);
                        if(moles.length<2)return null;
                        // Normalize to smallest
                        const minMol=Math.min(...moles.map(m=>m.mol));
                        const ratios=moles.map(m=>({...m,ratio:m.mol/minMol}));
                        // Try to find nice integer ratios (round to nearest 0.5 then simplify)
                        const roundHalf=v=>Math.round(v*2)/2;
                        const niceRatios=ratios.map(r=>({...r,nice:roundHalf(r.ratio)}));
                        // If all nice ratios can be doubled to integers, do it
                        const allHalf=niceRatios.every(r=>r.nice%1===0.5);
                        const display=allHalf?niceRatios.map(r=>({...r,nice:r.nice*2})):niceRatios;

                        return(
                          <div style={{marginTop:6,background:"#1E293B20",borderRadius:6,padding:"6px 8px"}}>
                            <div style={{fontSize:8,fontWeight:700,color:"#A78BFA",marginBottom:5}}>Stœchiométrie estimée</div>
                            <div style={{fontSize:7,color:"#64748B",marginBottom:5}}>Normalisé par MW (moles ∝ aire / MW)</div>
                            <div style={{display:"flex",alignItems:"baseline",gap:4,flexWrap:"wrap"}}>
                              {display.map((r,i)=>(
                                <div key={i} style={{display:"flex",alignItems:"baseline",gap:2}}>
                                  {i>0&&<span style={{color:"#64748B",fontSize:11,fontWeight:700}}>:</span>}
                                  <span style={{fontSize:16,fontWeight:800,color:"#A78BFA"}}>{r.nice%1===0?r.nice.toFixed(0):r.nice.toFixed(1)}</span>
                                  <span style={{fontSize:8,color:"#94A3B8"}}>{r.mw.toFixed(0)}<span style={{fontSize:7}}>kDa</span></span>
                                </div>
                              ))}
                            </div>
                            {/* Detail table */}
                            <div style={{marginTop:5,borderRadius:4,border:"1px solid #1E293B",overflow:"auto"}}>
                              <table style={{width:"100%",borderCollapse:"collapse"}}>
                                <thead><tr>
                                  <th style={S.th}>Bande</th><th style={S.th}>MW</th><th style={S.th}>Aire</th><th style={S.th}>mol. rel.</th><th style={S.th}>Ratio</th>
                                </tr></thead>
                                <tbody>{display.map((r,i)=>(
                                  <tr key={i} style={{background:i%2?"#1E293B10":"transparent"}}>
                                    <td style={{...S.td,color:COLORS[r.idx%10],fontWeight:600}}>Pic {r.idx+1}</td>
                                    <td style={{...S.td,color:"#F59E0B"}}>{r.mw.toFixed(1)}</td>
                                    <td style={S.td}>{r.area.toFixed(0)}</td>
                                    <td style={S.td}>{r.mol.toFixed(1)}</td>
                                    <td style={{...S.td,color:"#A78BFA",fontWeight:700,fontSize:10}}>{r.nice%1===0?r.nice.toFixed(0):r.nice.toFixed(1)}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })()}
                    </div>}
                {activeTab==="calibration"&&calibration&&peaksMW.length>0&&<div><div style={{fontSize:9,fontWeight:700,color:"#F59E0B",marginBottom:3}}>MW estimés — L{activeLane!==null?activeLane+1:"?"}</div><div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                      {peaksMW.map((p,i)=>{const pct=totalArea>0&&peakAreas[i]?(peakAreas[i].area/totalArea*100).toFixed(1):null;return <div key={i} style={{padding:"2px 6px",borderRadius:3,background:"#F59E0B15",border:"1px solid #F59E0B30",fontSize:9,color:"#FCD34D"}}>{p.mw.toFixed(1)} kDa{pct&&<span style={{color:"#22D3EE",marginLeft:4}}>{pct}%</span>}</div>;})}</div></div>}
                </div>
              </div>
            </div>
            <div style={S.info}>
              <span>{imgW}×{imgH}</span><span style={{color:"#334155"}}>│</span>
              <span>Pistes: {lanes.length}</span><span style={{color:"#334155"}}>│</span>
              <span>Pics: {activePeaks.length}</span>
              {calibration&&<><span style={{color:"#334155"}}>│</span><span style={{color:"#F59E0B"}}>R²={calibration.r2.toFixed(3)}</span></>}
              {rfEnabled&&rfCurvesFitted.length>=2&&<><span style={{color:"#334155"}}>│</span><span style={{color:"#FF61DC"}}>∿ {rfCurves.length} Rf</span></>}
              <span style={{color:"#334155"}}>│</span><span>{(imgZoom*100).toFixed(0)}%</span>
              {hoverY!==null&&<><span style={{color:"#334155"}}>│</span><span style={{color:"#FF6B6B"}}>Y={hoverY}{getMWatY(hoverY)?` ≈${getMWatY(hoverY).toFixed(1)} kDa`:""}</span></>}
              <span style={{marginLeft:"auto",color:"#475569"}}>{tool===TOOLS.SELECT?"Sélection":tool===TOOLS.ADD_LANE?"Placement piste":tool===TOOLS.CURVATURE?`Courbe Rf${(activeRfCurve??0)+1} — cliquez les bandes`:tool===TOOLS.CROP?"Rognage":tool===TOOLS.ANNOTATE?"Annotation":"Calibration"}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
