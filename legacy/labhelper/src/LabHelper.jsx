import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ══════════ CHEMICAL DATABASE ══════════ */
var DEFAULT_DB = [
  {n:"Ampicilline",mw:349.41,c:"Antibiotique",f:"C16H19N3O4S",sc:"100mg/mL H2O",wc:"50-100ug/mL"},
  {n:"Ampicilline sodique",mw:371.39,c:"Antibiotique",f:"C16H18N3NaO4S"},
  {n:"Kanamycine",mw:484.50,c:"Antibiotique",f:"C18H36N4O11",sc:"50mg/mL H2O",wc:"25-50ug/mL"},
  {n:"Chloramphenicol",mw:323.13,c:"Antibiotique",f:"C11H12Cl2N2O5",sc:"34mg/mL EtOH",wc:"25-34ug/mL"},
  {n:"Tetracycline",mw:444.44,c:"Antibiotique",f:"C22H24N2O8",sc:"12.5mg/mL EtOH"},
  {n:"Spectinomycine",mw:332.35,c:"Antibiotique",f:"C14H24N2O7",sc:"100mg/mL H2O"},
  {n:"Gentamicine",mw:477.60,c:"Antibiotique",f:"C21H43N5O7",sc:"10mg/mL H2O"},
  {n:"Streptomycine",mw:581.57,c:"Antibiotique",f:"C21H39N7O12",sc:"50mg/mL H2O"},
  {n:"Rifampicine",mw:822.94,c:"Antibiotique",f:"C43H58N4O12",sc:"50mg/mL DMSO"},
  {n:"Carbenicilline",mw:378.40,c:"Antibiotique",f:"C17H18N2O6S",sc:"100mg/mL H2O"},
  {n:"Hygromycine B",mw:527.52,c:"Antibiotique",f:"C20H37N3O13",wc:"50-200ug/mL"},
  {n:"Puromycine",mw:471.51,c:"Antibiotique",f:"C22H29N7O5",wc:"1-10ug/mL"},
  {n:"Blasticidine S",mw:422.43,c:"Antibiotique",f:"C17H26N8O5",wc:"2-10ug/mL"},
  {n:"Zeocine",mw:1535.0,c:"Antibiotique",f:"Cu-glycopeptide",wc:"25-100ug/mL"},
  {n:"Erythromycine",mw:733.93,c:"Antibiotique",f:"C37H67NO13"},
  {n:"Polymyxine B",mw:1301.56,c:"Antibiotique",f:"C56H98N16O13"},
  {n:"Vancomycine",mw:1449.27,c:"Antibiotique",f:"C66H75Cl2N9O24"},
  {n:"Neomycine",mw:614.64,c:"Antibiotique",f:"C23H46N6O13"},
  {n:"G418 (Geneticine)",mw:692.71,c:"Antibiotique",f:"C20H40N4O10",wc:"100-800ug/mL"},
  {n:"Ciprofloxacine",mw:331.34,c:"Antibiotique",f:"C17H18FN3O3"},
  {n:"Colistine",mw:1155.44,c:"Antibiotique",f:"C52H98N16O13"},
  {n:"Novobiocine",mw:612.62,c:"Antibiotique",f:"C31H36N2O11"},
  {n:"IPTG",mw:238.30,c:"Inducteur",f:"C9H18O5S",sc:"1M H2O",wc:"0.1-1mM"},
  {n:"X-Gal",mw:408.63,c:"Substrat",f:"C14H15BrClNO6",sc:"20mg/mL DMF",wc:"40ug/mL"},
  {n:"Arabinose (L-)",mw:150.13,c:"Inducteur",f:"C5H10O5",sc:"20% w/v",wc:"0.02-0.2%"},
  {n:"Rhamnose (L-)",mw:164.16,c:"Inducteur",f:"C6H12O5"},
  {n:"aTc (Anhydrotetracycline)",mw:426.42,c:"Inducteur",f:"C22H22N2O7"},
  {n:"Doxycycline",mw:444.43,c:"Inducteur",f:"C22H24N2O8",sc:"1mg/mL H2O"},
  {n:"Desthiobiotine",mw:214.26,c:"Ligand",f:"C9H16N2O3"},
  {n:"Biotine",mw:244.31,c:"Cofacteur",f:"C10H16N2O3S"},
  {n:"Iodoacetamide",mw:184.96,c:"Reactif",f:"C2H4INO"},
  {n:"NaCl",mw:58.44,c:"Sel",f:"NaCl"},
  {n:"KCl",mw:74.55,c:"Sel",f:"KCl"},
  {n:"MgCl2",mw:95.21,c:"Sel",f:"MgCl2"},
  {n:"MgCl2 6H2O",mw:203.30,c:"Sel",f:"MgCl2.6H2O"},
  {n:"MgSO4",mw:120.37,c:"Sel",f:"MgSO4"},
  {n:"CaCl2",mw:110.98,c:"Sel",f:"CaCl2"},
  {n:"CaCl2 2H2O",mw:147.01,c:"Sel",f:"CaCl2.2H2O"},
  {n:"NaOH",mw:40.00,c:"Base",f:"NaOH"},
  {n:"KOH",mw:56.11,c:"Base",f:"KOH"},
  {n:"HCl",mw:36.46,c:"Acide",f:"HCl"},
  {n:"H2SO4",mw:98.08,c:"Acide",f:"H2SO4"},
  {n:"NaHCO3",mw:84.01,c:"Sel",f:"NaHCO3"},
  {n:"Na2CO3",mw:105.99,c:"Sel",f:"Na2CO3"},
  {n:"NH4Cl",mw:53.49,c:"Sel",f:"NH4Cl"},
  {n:"(NH4)2SO4",mw:132.14,c:"Sel",f:"(NH4)2SO4"},
  {n:"NaN3 (Azide)",mw:65.01,c:"Conservateur",f:"NaN3"},
  {n:"Na3VO4",mw:183.94,c:"Inhib.phosphatase",f:"Na3VO4"},
  {n:"ZnSO4",mw:161.47,c:"Sel",f:"ZnSO4"},
  {n:"FeCl3",mw:162.20,c:"Sel",f:"FeCl3"},
  {n:"FeSO4 7H2O",mw:278.01,c:"Sel",f:"FeSO4.7H2O"},
  {n:"CuSO4 5H2O",mw:249.69,c:"Sel",f:"CuSO4.5H2O"},
  {n:"MnCl2 4H2O",mw:197.91,c:"Sel",f:"MnCl2.4H2O"},
  {n:"LiCl",mw:42.39,c:"Sel",f:"LiCl"},
  {n:"Acetate de sodium",mw:82.03,c:"Sel",f:"CH3COONa"},
  {n:"Acetate de sodium 3H2O",mw:136.08,c:"Sel",f:"CH3COONa.3H2O"},
  {n:"Citrate de sodium 2H2O",mw:294.10,c:"Sel",f:"C6H5Na3O7.2H2O"},
  {n:"Acide citrique",mw:192.12,c:"Acide",f:"C6H8O7"},
  {n:"Tris base",mw:121.14,c:"Tampon",f:"C4H11NO3",pk:"8.07"},
  {n:"Tris-HCl",mw:157.60,c:"Tampon",f:"C4H11NO3.HCl",pk:"8.07"},
  {n:"HEPES",mw:238.30,c:"Tampon",f:"C8H18N2O4S",pk:"7.48"},
  {n:"HEPES sodique",mw:260.29,c:"Tampon",f:"C8H17N2NaO4S"},
  {n:"MOPS",mw:209.26,c:"Tampon",f:"C7H15NO4S",pk:"7.20"},
  {n:"MES",mw:195.24,c:"Tampon",f:"C6H13NO4S",pk:"6.15"},
  {n:"PIPES",mw:302.37,c:"Tampon",f:"C8H18N2O6S2",pk:"6.76"},
  {n:"NaH2PO4",mw:119.98,c:"Tampon",f:"NaH2PO4"},
  {n:"Na2HPO4",mw:141.96,c:"Tampon",f:"Na2HPO4"},
  {n:"Na2HPO4 7H2O",mw:268.07,c:"Tampon",f:"Na2HPO4.7H2O"},
  {n:"Bicine",mw:163.17,c:"Tampon",f:"C6H13NO4",pk:"8.26"},
  {n:"Tricine",mw:179.17,c:"Tampon",f:"C6H13NO5",pk:"8.05"},
  {n:"CAPS",mw:221.32,c:"Tampon",f:"C9H19NO3S",pk:"10.40"},
  {n:"CHES",mw:207.29,c:"Tampon",f:"C8H17NO3S",pk:"9.39"},
  {n:"Bis-Tris",mw:209.24,c:"Tampon",f:"C8H19NO5",pk:"6.46"},
  {n:"TES",mw:229.25,c:"Tampon",f:"C6H15NO6S",pk:"7.40"},
  {n:"Acide borique",mw:61.83,c:"Tampon",f:"H3BO3"},
  {n:"DTT",mw:154.25,c:"Reducteur",f:"C4H10O2S2",sc:"1M H2O",wc:"1-10mM"},
  {n:"beta-Mercaptoethanol",mw:78.13,c:"Reducteur",f:"C2H6OS"},
  {n:"TCEP-HCl",mw:286.65,c:"Reducteur",f:"C9H15O6P.HCl"},
  {n:"Glutathion (GSH)",mw:307.32,c:"Reducteur",f:"C10H17N3O6S"},
  {n:"Glutathion (GSSG)",mw:612.63,c:"Reducteur",f:"C20H32N6O12S2"},
  {n:"Acide ascorbique",mw:176.12,c:"Reducteur",f:"C6H8O6"},
  {n:"SDS",mw:288.38,c:"Detergent",f:"C12H25NaO4S"},
  {n:"Triton X-100",mw:647.0,c:"Detergent",f:"C34H62O11",cm:"0.22mM"},
  {n:"Tween 20",mw:1228.0,c:"Detergent",f:"C58H114O26",cm:"0.06mM"},
  {n:"Tween 80",mw:1310.0,c:"Detergent",f:"C64H124O26"},
  {n:"NP-40 (IGEPAL)",mw:603.0,c:"Detergent",f:"C33H60O10"},
  {n:"CHAPS",mw:614.88,c:"Detergent",f:"C32H58N2O7S",cm:"6-10mM"},
  {n:"Digitonine",mw:1229.31,c:"Detergent",f:"C56H92O29"},
  {n:"DDM",mw:510.62,c:"Detergent",f:"C24H46O11",cm:"0.17mM"},
  {n:"Octyl glucoside",mw:292.37,c:"Detergent",f:"C14H28O6",cm:"25mM"},
  {n:"Deoxycholate de sodium",mw:414.55,c:"Detergent",f:"C24H39NaO4"},
  {n:"Lauryl sarcosine",mw:293.38,c:"Detergent",f:"C15H28NNaO3"},
  {n:"PMSF",mw:174.19,c:"Inhibiteur",f:"C7H7FO2S",sc:"100mM isopropanol"},
  {n:"AEBSF",mw:239.69,c:"Inhibiteur",f:"C8H10FNO2S.HCl"},
  {n:"Leupeptine",mw:426.55,c:"Inhibiteur",f:"C20H38N6O4"},
  {n:"Aprotinine",mw:6512.0,c:"Inhibiteur",f:"58 AA"},
  {n:"Pepstatine A",mw:685.90,c:"Inhibiteur",f:"C34H63N5O9"},
  {n:"EDTA",mw:292.24,c:"Chelateur",f:"C10H16N2O8"},
  {n:"EDTA-Na2.2H2O",mw:372.24,c:"Chelateur",f:"C10H14N2Na2O8.2H2O"},
  {n:"EGTA",mw:380.35,c:"Chelateur",f:"C14H24N2O10"},
  {n:"Imidazole",mw:68.08,c:"Ligand",f:"C3H4N2"},
  {n:"Uree",mw:60.06,c:"Denaturant",f:"CH4N2O"},
  {n:"Guanidine-HCl",mw:95.53,c:"Denaturant",f:"CH5N3.HCl"},
  {n:"dNTPs (moyenne)",mw:487.17,c:"Nucleotide",f:"Moy. dNTPs"},
  {n:"ATP",mw:507.18,c:"Nucleotide",f:"C10H16N5O13P3"},
  {n:"GTP",mw:523.18,c:"Nucleotide",f:"C10H16N5O14P3"},
  {n:"NAD+",mw:663.43,c:"Cofacteur",f:"C21H27N7O14P2"},
  {n:"NADH",mw:665.44,c:"Cofacteur",f:"C21H29N7O14P2"},
  {n:"NADPH",mw:745.42,c:"Cofacteur",f:"C21H30N7O17P3"},
  {n:"FAD",mw:785.55,c:"Cofacteur",f:"C27H33N9O15P2"},
  {n:"CoA",mw:767.53,c:"Cofacteur",f:"C21H36N7O16P3S"},
  {n:"SAM",mw:399.44,c:"Cofacteur",f:"C15H22N6O5S"},
  {n:"Glucose",mw:180.16,c:"Sucre",f:"C6H12O6"},
  {n:"Saccharose",mw:342.30,c:"Sucre",f:"C12H22O11"},
  {n:"Trehalose",mw:342.30,c:"Sucre",f:"C12H22O11"},
  {n:"Glycerol",mw:92.09,c:"Polyol",f:"C3H8O3"},
  {n:"PEG 3350",mw:3350.0,c:"Polymere",f:"HO(C2H4O)nH"},
  {n:"PEG 6000",mw:6000.0,c:"Polymere",f:"HO(C2H4O)nH"},
  {n:"Ethanol",mw:46.07,c:"Solvant",f:"C2H5OH"},
  {n:"Methanol",mw:32.04,c:"Solvant",f:"CH3OH"},
  {n:"Isopropanol",mw:60.10,c:"Solvant",f:"C3H7OH"},
  {n:"DMSO",mw:78.13,c:"Solvant",f:"C2H6OS"},
  {n:"DMF",mw:73.09,c:"Solvant",f:"C3H7NO"},
  {n:"Acrylamide",mw:71.08,c:"Gel",f:"C3H5NO"},
  {n:"Bis-acrylamide",mw:154.17,c:"Gel",f:"C7H10N2O2"},
  {n:"APS",mw:228.20,c:"Initiateur",f:"(NH4)2S2O8"},
  {n:"TEMED",mw:116.20,c:"Catalyseur",f:"C6H16N2"},
  {n:"Agarose",mw:306.27,c:"Gel",f:"(C12H18O9)n"},
  {n:"Glycine",mw:75.03,c:"Acide amine",f:"C2H5NO2"},
  {n:"Alanine",mw:89.09,c:"Acide amine",f:"C3H7NO2"},
  {n:"Valine",mw:117.15,c:"Acide amine",f:"C5H11NO2"},
  {n:"Leucine",mw:131.17,c:"Acide amine",f:"C6H13NO2"},
  {n:"Cysteine",mw:121.16,c:"Acide amine",f:"C3H7NO2S"},
  {n:"Tryptophane",mw:204.23,c:"Acide amine",f:"C11H12N2O2"},
  {n:"Histidine",mw:155.16,c:"Acide amine",f:"C6H9N3O2"},
  {n:"Arginine",mw:174.20,c:"Acide amine",f:"C6H14N4O2"},
  {n:"Lysine",mw:146.19,c:"Acide amine",f:"C6H14N2O2"},
  {n:"BSA",mw:66430,c:"Proteine",f:"~583 AA"},
  {n:"Lysozyme",mw:14307,c:"Enzyme",f:"~129 AA"},
  {n:"Trypsine",mw:23300,c:"Enzyme",f:"~223 AA"},
  {n:"Proteinase K",mw:28930,c:"Enzyme",f:"~279 AA"},
  {n:"RNase A",mw:13700,c:"Enzyme",f:"~124 AA"},
  {n:"DNase I",mw:31000,c:"Enzyme",f:"~260 AA"},
  {n:"GFP",mw:26900,c:"Proteine",f:"~238 AA"},
  {n:"mCherry",mw:26700,c:"Proteine",f:"~236 AA"},
  {n:"Streptavidine",mw:53000,c:"Proteine",f:"4x~13kDa"},
  {n:"DAPI",mw:350.25,c:"Colorant",f:"C16H15N5.2HCl"},
  {n:"Bromure d ethidium",mw:394.31,c:"Colorant",f:"C21H20BrN3"},
  {n:"SYBR Green I",mw:509.7,c:"Colorant",f:"Proprietaire"},
  {n:"Coomassie R-250",mw:825.97,c:"Colorant",f:"C45H44N3NaO7S2"},
  {n:"Bleu de bromophenol",mw:669.96,c:"Colorant",f:"C19H10Br4O5S"},
  {n:"Rouge Ponceau S",mw:760.57,c:"Colorant",f:"C22H12N4Na4O13S4"},
  {n:"Pyruvate de sodium",mw:110.04,c:"Metabolite",f:"C3H3NaO3"},
];

/* ══════════ UNITS & HELPERS ══════════ */
var CU = [{l:"M",f:1},{l:"mM",f:1e-3},{l:"\u00b5M",f:1e-6},{l:"nM",f:1e-9}];
var VU = [{l:"L",f:1},{l:"mL",f:1e-3},{l:"\u00b5L",f:1e-6}];
var MU = [{l:"g",f:1},{l:"mg",f:1e-3},{l:"\u00b5g",f:1e-6},{l:"ng",f:1e-9}];

function tB(v,u,la){var x=u.find(function(i){return i.l===la});return v*(x?x.f:1)}
function fB(v,u,la){var x=u.find(function(i){return i.l===la});return v/(x?x.f:1)}
function sf(n){if(n===null||n===undefined||isNaN(n)||n===0)return "0";if(!isFinite(n))return "Inf";if(Math.abs(n)>=1e6||Math.abs(n)<1e-4)return n.toExponential(4);if(Math.abs(n)<1)return parseFloat(n.toPrecision(4)).toString();return parseFloat(n.toFixed(4)).toString()}
function cpy(v){try{navigator.clipboard.writeText(v)}catch(e){}}

/* ══════════ PERSISTENT DB HOOK ══════════ */
function useDB() {
  var [extra, setExtra] = useState([]);
  useEffect(function(){(async function(){try{var r=await window.storage.get("lh5db");if(r&&r.value)setExtra(JSON.parse(r.value))}catch(e){}})()},[]);
  var save = useCallback(async function(list){setExtra(list);try{await window.storage.set("lh5db",JSON.stringify(list))}catch(e){}},[]);
  var all = useMemo(function(){return DEFAULT_DB.concat(extra)},[extra]);
  return {all:all, extra:extra, save:save};
}

function useHist() {
  var [h, sH] = useState([]);
  useEffect(function(){(async function(){try{var r=await window.storage.get("lh5h");if(r&&r.value)sH(JSON.parse(r.value))}catch(e){}})()},[]);
  var add = useCallback(async function(e){var n=[Object.assign({},e,{ts:Date.now()})].concat(h).slice(0,80);sH(n);try{await window.storage.set("lh5h",JSON.stringify(n))}catch(e2){}},[h]);
  var clr = useCallback(async function(){sH([]);try{await window.storage.delete("lh5h")}catch(e){}},[]);
  return {h:h,add:add,clr:clr};
}

/* ══════════ SVG + UI PRIMITIVES ══════════ */
function Svg(p){return <svg width={p.s||18} height={p.s||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={p.cl||""}>{p.children}</svg>}

function NumIn(p){var dk=p.dark;return(
  <div className="flex flex-col gap-1.5">
    {p.label&&<label className={"text-[11px] font-semibold tracking-wide uppercase "+(dk?"text-gray-400":"text-gray-500")}>{p.label}</label>}
    <div className="flex">
      <input type="number" step={p.step||"any"} value={p.value} onChange={function(e){p.onChange(e.target.value)}} placeholder={p.ph||"0"} disabled={p.disabled}
        className={"flex-1 min-w-0 px-3 py-2.5 border-y border-l text-sm font-mono outline-none transition-all focus:ring-2 focus:ring-blue-400/40 disabled:opacity-40 "+(dk?"bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-600":"bg-white border-gray-300 text-gray-900 placeholder-gray-400")+(p.units?" rounded-l-lg":" rounded-lg border-r")}/>
      {p.units&&<select value={p.unit} onChange={function(e){p.onUnitChange(e.target.value)}} className={"px-2 py-2.5 rounded-r-lg border text-xs font-semibold cursor-pointer outline-none "+(dk?"bg-gray-700 border-gray-600 text-gray-200":"bg-gray-50 border-gray-300 text-gray-700")}>{p.units.map(function(u){return <option key={u.l} value={u.l}>{u.l}</option>})}</select>}
    </div>
  </div>
)}

function Res(p){var dk=p.dark;return(
  <div className={"relative p-4 rounded-xl border-2 border-dashed "+(dk?"border-emerald-700 bg-emerald-950/30":"border-emerald-300 bg-emerald-50/60")}>
    <div className={"text-[10px] font-semibold uppercase tracking-wider mb-1 "+(dk?"text-emerald-400":"text-emerald-600")}>{p.label}</div>
    <div className="flex items-baseline gap-2">
      <span className={"text-2xl font-mono font-bold "+(dk?"text-emerald-300":"text-emerald-700")}>{p.value}</span>
      {p.unit&&<span className="text-sm font-semibold text-emerald-500">{p.unit}</span>}
    </div>
    {p.onCopy&&<button onClick={p.onCopy} className={"absolute top-3 right-3 p-1.5 rounded-md "+(dk?"hover:bg-emerald-900/50 text-emerald-500":"hover:bg-emerald-100 text-emerald-400")}><Svg s={14}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 2h6v4H9V2z"/></Svg></button>}
  </div>
)}

function Bt(p){var dk=p.dark,v=p.v||"primary";var s={primary:dk?"bg-blue-600 hover:bg-blue-500 text-white":"bg-blue-600 hover:bg-blue-700 text-white",secondary:dk?"bg-gray-700 hover:bg-gray-600 text-gray-200":"bg-gray-100 hover:bg-gray-200 text-gray-700",danger:dk?"bg-red-900/40 hover:bg-red-800/50 text-red-400":"bg-red-50 hover:bg-red-100 text-red-600"};return <button onClick={p.onClick} disabled={p.disabled} className={"px-4 py-2 rounded-lg text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 justify-center "+(s[v]||s.primary)+" "+(p.className||"")}>{p.children}</button>}

function Fm(p){var dk=p.dark;return <div className={"p-3 rounded-lg text-xs font-mono text-center "+(dk?"bg-gray-800 text-gray-400 border border-gray-700":"bg-gray-50 text-gray-500 border border-gray-200")}>{p.t}</div>}

/* ══════════ MOD 1: MOLARITE ══════════ */
function MolCalc(p){var dk=p.dark,ae=p.addEntry,DB=p.db;var[sr,sSr]=useState("");var[sel,sSel]=useState(null);var[mw,sMw]=useState("");var[co,sCo]=useState("");var[cU,sCU]=useState("mM");var[vo,sVo]=useState("");var[vU,sVU]=useState("mL");var[mU,sMU]=useState("mg");var[sh,sSh]=useState(false);
var sg=useMemo(function(){if(!sr)return[];var q=sr.toLowerCase();return DB.filter(function(x){return x.n.toLowerCase().indexOf(q)>=0||x.f.toLowerCase().indexOf(q)>=0||x.c.toLowerCase().indexOf(q)>=0}).slice(0,10)},[sr,DB]);
var mass=useMemo(function(){var C=parseFloat(co),V=parseFloat(vo),M=parseFloat(mw);if(!C||!V||!M||C<=0||V<=0||M<=0)return null;return fB(tB(C,CU,cU)*tB(V,VU,vU)*M,MU,mU)},[co,cU,vo,vU,mw,mU]);
function pick(x){sSel(x);sSr(x.n);sMw(String(x.mw));sSh(false)}
return(<div className="space-y-5">
  <div className="relative">
    <label className={"text-[11px] font-semibold tracking-wide uppercase block mb-1.5 "+(dk?"text-gray-400":"text-gray-500")}>Produit ({DB.length} en base)</label>
    <input type="text" value={sr} onChange={function(e){sSr(e.target.value);sSh(true);sSel(null)}} onFocus={function(){if(sr)sSh(true)}} onBlur={function(){setTimeout(function(){sSh(false)},200)}} placeholder="Nom, formule ou categorie..." className={"w-full px-3 py-2.5 rounded-lg border text-sm outline-none focus:ring-2 focus:ring-blue-400/40 "+(dk?"bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-600":"bg-white border-gray-300 text-gray-900 placeholder-gray-400")}/>
    {sh&&sg.length>0&&<div className={"absolute z-50 left-0 right-0 mt-1 rounded-lg border shadow-2xl max-h-72 overflow-y-auto "+(dk?"bg-gray-800 border-gray-700":"bg-white border-gray-200")}>{sg.map(function(x){return(<button key={x.n+x.mw} onMouseDown={function(){pick(x)}} className={"w-full text-left px-3 py-2.5 flex items-center justify-between "+(dk?"hover:bg-gray-700":"hover:bg-blue-50")}><div><span className={"text-sm font-semibold "+(dk?"text-gray-100":"text-gray-900")}>{x.n}</span><span className={"text-xs ml-2 "+(dk?"text-gray-500":"text-gray-400")}>{x.f}</span></div><div className="text-right flex-shrink-0 ml-3"><span className={"text-xs font-mono font-bold "+(dk?"text-blue-400":"text-blue-600")}>{x.mw.toLocaleString()}</span><span className={"text-[10px] block "+(dk?"text-gray-600":"text-gray-400")}>{x.c}</span></div></button>)})}</div>}
    {sel&&<div className={"mt-2 px-3 py-2 rounded-lg text-xs flex flex-wrap items-center justify-between gap-2 "+(dk?"bg-blue-950/40 text-blue-300 border border-blue-800":"bg-blue-50 text-blue-700 border border-blue-200")}><span><strong>{sel.n}</strong> - {sel.f}</span><span className="font-mono font-bold">{sel.mw.toLocaleString()} g/mol</span></div>}
  </div>
  <NumIn label="Masse Molaire (g/mol)" value={mw} onChange={sMw} dark={dk} ph="349.41"/>
  <div className="grid grid-cols-2 gap-4"><NumIn label="Concentration" value={co} onChange={sCo} unit={cU} units={CU} onUnitChange={sCU} dark={dk}/><NumIn label="Volume" value={vo} onChange={sVo} unit={vU} units={VU} onUnitChange={sVU} dark={dk}/></div>
  <div><label className={"text-[11px] font-semibold tracking-wide uppercase block mb-1.5 "+(dk?"text-gray-400":"text-gray-500")}>Unite resultat</label><select value={mU} onChange={function(e){sMU(e.target.value)}} className={"w-full px-3 py-2.5 rounded-lg border text-sm font-semibold cursor-pointer outline-none "+(dk?"bg-gray-700 border-gray-600 text-gray-200":"bg-gray-50 border-gray-300 text-gray-700")}>{MU.map(function(u){return <option key={u.l} value={u.l}>{u.l}</option>})}</select></div>
  {mass!==null&&<><Res label="Masse a peser (m = C x V x M)" value={sf(mass)} unit={mU} dark={dk} onCopy={function(){cpy(sf(mass))}}/><Bt onClick={function(){ae({module:"Molarite",detail:(sel?sel.n:"Custom")+": "+sf(mass)+" "+mU})}} dark={dk}>Sauvegarder</Bt></>}
</div>)}

/* ══════════ MOD 2: DILUTION ══════════ */
function DilCalc(p){var dk=p.dark,ae=p.addEntry;var[c1,s1]=useState("");var[u1,sU1]=useState("mM");var[c2,s2]=useState("");var[u2,sU2]=useState("\u00b5M");var[v2,sV2]=useState("");var[uV,sUV]=useState("mL");var[uR,sUR]=useState("\u00b5L");
var r=useMemo(function(){var C1=tB(parseFloat(c1),CU,u1),C2=tB(parseFloat(c2),CU,u2),V2=tB(parseFloat(v2),VU,uV);if(!C1||!C2||!V2||C1<=0||C2<=0||V2<=0)return null;if(C2>C1)return"ERR";return fB((C2*V2)/C1,VU,uR)},[c1,u1,c2,u2,v2,uV,uR]);
var sv=(r&&r!=="ERR")?fB(tB(parseFloat(v2),VU,uV)-tB(r,VU,uR),VU,uR):null;
return(<div className="space-y-5"><Fm t="C1 x V1 = C2 x V2" dark={dk}/>
  <div className="grid grid-cols-2 gap-4"><NumIn label="C1 (stock)" value={c1} onChange={s1} unit={u1} units={CU} onUnitChange={sU1} dark={dk}/><NumIn label="C2 (finale)" value={c2} onChange={s2} unit={u2} units={CU} onUnitChange={sU2} dark={dk}/></div>
  <div className="grid grid-cols-2 gap-4"><NumIn label="V2 (vol. final)" value={v2} onChange={sV2} unit={uV} units={VU} onUnitChange={sUV} dark={dk}/><div className="flex flex-col gap-1.5"><label className={"text-[11px] font-semibold tracking-wide uppercase "+(dk?"text-gray-400":"text-gray-500")}>Unite V1</label><select value={uR} onChange={function(e){sUR(e.target.value)}} className={"px-3 py-2.5 rounded-lg border text-sm font-semibold outline-none "+(dk?"bg-gray-700 border-gray-600 text-gray-200":"bg-gray-50 border-gray-300 text-gray-700")}>{VU.map(function(u){return <option key={u.l} value={u.l}>{u.l}</option>})}</select></div></div>
  {r==="ERR"&&<div className={"p-3 rounded-lg text-sm font-semibold "+(dk?"bg-red-950/40 text-red-400 border border-red-800":"bg-red-50 text-red-600 border border-red-200")}>C2 ne peut pas depasser C1</div>}
  {r&&r!=="ERR"&&<><Res label="V1 (stock a prelever)" value={sf(r)} unit={uR} dark={dk} onCopy={function(){cpy(sf(r))}}/>{sv>0&&<div className={"text-xs font-mono px-3 py-2 rounded-lg "+(dk?"bg-gray-800 text-gray-400":"bg-gray-100 text-gray-500")}>Solvant: {sf(sv)} {uR}</div>}<Bt onClick={function(){ae({module:"Dilution",detail:"V1="+sf(r)+" "+uR})}} dark={dk}>Sauvegarder</Bt></>}
</div>)}

/* ══════════ MOD 3: CENTRIFUGATION ══════════ */
function CentCalc(p){var dk=p.dark,ae=p.addEntry;var[m,sM]=useState("r");var[rpm,sR]=useState("");var[rcf,sG]=useState("");var[rad,sRad]=useState("100");
var res=useMemo(function(){var r=parseFloat(rad);if(!r||r<=0)return null;if(m==="r"){var n=parseFloat(rpm);if(!n||n<=0)return null;return 1.118e-5*r*n*n}var g=parseFloat(rcf);if(!g||g<=0)return null;return Math.sqrt(g/(1.118e-5*r))},[m,rpm,rcf,rad]);
return(<div className="space-y-5"><Fm t="RCF = 1.118 x 10^-5 x r(mm) x RPM^2" dark={dk}/>
  <div className="flex gap-2"><Bt v={m==="r"?"primary":"secondary"} onClick={function(){sM("r")}} dark={dk} className="flex-1">RPM &rarr; xg</Bt><Bt v={m==="g"?"primary":"secondary"} onClick={function(){sM("g")}} dark={dk} className="flex-1">xg &rarr; RPM</Bt></div>
  <NumIn label="Rayon rotor (mm)" value={rad} onChange={sRad} dark={dk} ph="100"/>
  {m==="r"?<NumIn label="RPM" value={rpm} onChange={sR} dark={dk} ph="13000"/>:<NumIn label="RCF (xg)" value={rcf} onChange={sG} dark={dk} ph="16000"/>}
  {res!==null&&<><Res label={m==="r"?"RCF":"RPM"} value={sf(res)} unit={m==="r"?"x g":"RPM"} dark={dk} onCopy={function(){cpy(sf(res))}}/><Bt onClick={function(){ae({module:"Centri.",detail:(m==="r"?rpm+" RPM -> "+sf(res)+" xg":rcf+" xg -> "+sf(res)+" RPM")})}} dark={dk}>Sauvegarder</Bt></>}
</div>)}

/* ══════════ MOD 4: MASTER MIX ══════════ */
var defC=[{id:1,n:"Buffer (10x)",v:"5"},{id:2,n:"dNTPs (10mM)",v:"1"},{id:3,n:"Primer Fwd",v:"1"},{id:4,n:"Primer Rev",v:"1"},{id:5,n:"Template",v:"1"},{id:6,n:"Polymerase",v:"0.5"},{id:7,n:"H2O nf",v:"40.5"}];
function MMCalc(p){var dk=p.dark,ae=p.addEntry;var[cs,sCs]=useState(defC);var[rx,sRx]=useState("8");var[su,sSu]=useState("10");var nid=useRef(100);
var tot=cs.reduce(function(s,c){return s+(parseFloat(c.v)||0)},0);var N=(parseFloat(rx)||0)*(1+(parseFloat(su)||0)/100);
return(<div className="space-y-4">
  <div className="grid grid-cols-2 gap-4"><NumIn label="Reactions" value={rx} onChange={sRx} dark={dk} step="1"/><NumIn label="Surplus (%)" value={su} onChange={sSu} dark={dk} step="1"/></div>
  <div className={"rounded-xl border overflow-hidden "+(dk?"border-gray-700":"border-gray-200")}>
    <div className={"grid grid-cols-12 text-[10px] font-semibold uppercase tracking-wider px-3 py-2 "+(dk?"bg-gray-800 text-gray-500 border-b border-gray-700":"bg-gray-50 text-gray-400 border-b border-gray-200")}><div className="col-span-5">Composant</div><div className="col-span-2 text-right">uL/rxn</div><div className="col-span-1"></div><div className="col-span-3 text-right">x{sf(N)}</div><div className="col-span-1"></div></div>
    {cs.map(function(c){return(<div key={c.id} className={"grid grid-cols-12 items-center px-3 py-1.5 border-b last:border-0 "+(dk?"border-gray-800":"border-gray-100")}>
      <div className="col-span-5"><input value={c.n} onChange={function(e){sCs(function(prev){return prev.map(function(z){return z.id===c.id?Object.assign({},z,{n:e.target.value}):z})})}} className={"w-full px-2 py-1.5 text-sm rounded border outline-none "+(dk?"bg-gray-800 border-gray-700 text-gray-200":"bg-white border-gray-200 text-gray-800")}/></div>
      <div className="col-span-2"><input type="number" step="any" value={c.v} onChange={function(e){sCs(function(prev){return prev.map(function(z){return z.id===c.id?Object.assign({},z,{v:e.target.value}):z})})}} className={"w-full px-2 py-1.5 text-sm text-right font-mono rounded border outline-none "+(dk?"bg-gray-800 border-gray-700 text-gray-200":"bg-white border-gray-200 text-gray-800")}/></div>
      <div className={"col-span-1 text-[10px] text-center "+(dk?"text-gray-600":"text-gray-400")}>uL</div>
      <div className={"col-span-3 text-right text-sm font-mono font-bold "+(dk?"text-emerald-400":"text-emerald-600")}>{sf((parseFloat(c.v)||0)*N)}</div>
      <div className="col-span-1 text-right"><button onClick={function(){sCs(function(prev){return prev.filter(function(z){return z.id!==c.id})})}} className={"p-1 rounded "+(dk?"text-gray-600 hover:text-red-400":"text-gray-300 hover:text-red-500")}><Svg s={12}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></Svg></button></div>
    </div>)})}
  </div>
  <div className="flex items-center justify-between flex-wrap gap-2">
    <Bt v="secondary" onClick={function(){nid.current++;sCs(function(prev){return prev.concat([{id:nid.current,n:"",v:""}])})}} dark={dk}>+ Ajouter</Bt>
    <div className={"text-xs font-mono "+(dk?"text-gray-400":"text-gray-500")}>/rxn: <strong>{sf(tot)} uL</strong> | Mix: <strong>{sf(tot*N)} uL</strong></div>
  </div>
  <Bt onClick={function(){ae({module:"Master Mix",detail:rx+" rxn(+"+su+"%)="+sf(tot*N)+" uL"})}} dark={dk}>Sauvegarder</Bt>
</div>)}

/* ══════════ MOD 5: ADN -> pmol ══════════ */
function DnaCalc(p){var dk=p.dark,ae=p.addEntry;var[ng,sNg]=useState("");var[bp,sBp]=useState("");var[tp,sTp]=useState("ds");
var pm=useMemo(function(){var m=parseFloat(ng),n=parseFloat(bp);if(!m||!n||m<=0||n<=0)return null;return(m*1e-9)/(n*(tp==="ds"?660:330))*1e12},[ng,bp,tp]);
return(<div className="space-y-5"><Fm t="pmol = masse(ng) / (pb x Mw/pb) | ds=660, ss=330" dark={dk}/>
  <div className="flex gap-2"><Bt v={tp==="ds"?"primary":"secondary"} onClick={function(){sTp("ds")}} dark={dk} className="flex-1">dsDNA</Bt><Bt v={tp==="ss"?"primary":"secondary"} onClick={function(){sTp("ss")}} dark={dk} className="flex-1">ssDNA</Bt></div>
  <div className="grid grid-cols-2 gap-4"><NumIn label="Masse (ng)" value={ng} onChange={sNg} dark={dk} ph="100"/><NumIn label="Longueur (pb)" value={bp} onChange={sBp} dark={dk} ph="5000"/></div>
  {pm!==null&&<><div className="grid grid-cols-2 gap-4"><Res label="pmol" value={sf(pm)} unit="pmol" dark={dk} onCopy={function(){cpy(sf(pm))}}/><Res label="fmol" value={sf(pm*1000)} unit="fmol" dark={dk}/></div><div className={"text-xs font-mono px-3 py-2 rounded-lg "+(dk?"bg-gray-800 text-gray-400":"bg-gray-100 text-gray-500")}>~ {sf(pm*6.022e11)} molecules</div><Bt onClick={function(){ae({module:"ADN->pmol",detail:ng+"ng "+bp+"pb -> "+sf(pm)+" pmol"})}} dark={dk}>Sauvegarder</Bt></>}
</div>)}

/* ══════════ MOD 6: BUFFER PREP ══════════ */
function BufferCalc(p){
  var dk=p.dark,ae=p.addEntry,DB=p.db;
  var[volFinal,sVolFinal]=useState("100");
  var[vfUnit,sVfUnit]=useState("mL");
  var[items,sItems]=useState([{id:1,name:"Tris-HCl",mw:157.60,concFinal:"50",concFinalU:"mM",source:"powder",stockConc:"",stockConcU:"mM"}]);
  var nid=useRef(10);
  var[srch,sSrch]=useState({});
  var[showS,setShowS]=useState({});

  function addItem(){nid.current++;sItems(function(prev){return prev.concat([{id:nid.current,name:"",mw:0,concFinal:"",concFinalU:"mM",source:"powder",stockConc:"",stockConcU:"mM"}])})}
  function updItem(id,field,val){sItems(function(prev){return prev.map(function(it){return it.id===id?Object.assign({},it,{[field]:val}):it})})}
  function delItem(id){sItems(function(prev){return prev.filter(function(it){return it.id!==id})})}

  function pickChem(id,chem){
    sItems(function(prev){return prev.map(function(it){return it.id===id?Object.assign({},it,{name:chem.n,mw:chem.mw}):it})});
    sSrch(function(prev){var o=Object.assign({},prev);o[id]=chem.n;return o});
    setShowS(function(prev){var o=Object.assign({},prev);o[id]=false;return o});
  }

  var VF=tB(parseFloat(volFinal)||0,VU,vfUnit);

  return(<div className="space-y-5">
    <Fm t="Recette de preparation de tampon / solution" dark={dk}/>
    <NumIn label="Volume final" value={volFinal} onChange={sVolFinal} unit={vfUnit} units={VU} onUnitChange={sVfUnit} dark={dk} ph="100"/>

    <div className="space-y-3">
      {items.map(function(it){
        var searchVal=srch[it.id]||it.name||"";
        var suggestions=(showS[it.id]&&searchVal.length>0)?DB.filter(function(x){return x.n.toLowerCase().indexOf(searchVal.toLowerCase())>=0}).slice(0,6):[];

        var cF=tB(parseFloat(it.concFinal)||0,CU,it.concFinalU);
        var result=null;
        if(VF>0&&cF>0){
          if(it.source==="powder"&&it.mw>0){
            var mass_g=cF*VF*it.mw;
            result={type:"mass",val:mass_g};
          } else if(it.source==="stock"){
            var cS=tB(parseFloat(it.stockConc)||0,CU,it.stockConcU);
            if(cS>0&&cS>=cF){
              var vol_L=(cF*VF)/cS;
              result={type:"vol",val:vol_L};
            } else if(cS>0&&cS<cF){
              result={type:"err"};
            }
          }
        }

        return(<div key={it.id} className={"p-3 rounded-xl border space-y-3 "+(dk?"border-gray-700 bg-gray-800/30":"border-gray-200 bg-gray-50/50")}>
          <div className="flex items-start gap-2">
            <div className="flex-1 relative">
              <input type="text" value={searchVal} onChange={function(e){sSrch(function(prev){var o=Object.assign({},prev);o[it.id]=e.target.value;return o});setShowS(function(prev){var o=Object.assign({},prev);o[it.id]=true;return o});updItem(it.id,"name",e.target.value);updItem(it.id,"mw",0)}} onFocus={function(){if(searchVal)setShowS(function(prev){var o=Object.assign({},prev);o[it.id]=true;return o})}} onBlur={function(){setTimeout(function(){setShowS(function(prev){var o=Object.assign({},prev);o[it.id]=false;return o})},200)}} placeholder="Produit..." className={"w-full px-3 py-2 rounded-lg border text-sm outline-none "+(dk?"bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-600":"bg-white border-gray-300 text-gray-900 placeholder-gray-400")}/>
              {suggestions.length>0&&<div className={"absolute z-50 left-0 right-0 mt-1 rounded-lg border shadow-xl max-h-48 overflow-y-auto "+(dk?"bg-gray-800 border-gray-700":"bg-white border-gray-200")}>{suggestions.map(function(x){return <button key={x.n+x.mw} onMouseDown={function(){pickChem(it.id,x)}} className={"w-full text-left px-3 py-2 text-sm flex justify-between "+(dk?"hover:bg-gray-700 text-gray-200":"hover:bg-blue-50 text-gray-800")}><span>{x.n}</span><span className={"font-mono text-xs "+(dk?"text-blue-400":"text-blue-600")}>{x.mw}</span></button>})}</div>}
            </div>
            <button onClick={function(){delItem(it.id)}} className={"p-2 rounded-lg "+(dk?"text-gray-600 hover:text-red-400 hover:bg-gray-800":"text-gray-400 hover:text-red-500 hover:bg-red-50")}><Svg s={14}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></Svg></button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <button onClick={function(){updItem(it.id,"source","powder")}} className={"text-xs px-3 py-1.5 rounded-lg font-semibold border "+(it.source==="powder"?(dk?"bg-blue-600/20 text-blue-400 border-blue-600":"bg-blue-50 text-blue-700 border-blue-300"):(dk?"border-gray-700 text-gray-500":"border-gray-200 text-gray-400"))}>Poudre</button>
            <button onClick={function(){updItem(it.id,"source","stock")}} className={"text-xs px-3 py-1.5 rounded-lg font-semibold border "+(it.source==="stock"?(dk?"bg-blue-600/20 text-blue-400 border-blue-600":"bg-blue-50 text-blue-700 border-blue-300"):(dk?"border-gray-700 text-gray-500":"border-gray-200 text-gray-400"))}>Solution stock</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {it.source==="powder"&&<NumIn label="M (g/mol)" value={it.mw||""} onChange={function(v){updItem(it.id,"mw",parseFloat(v)||0)}} dark={dk} ph="157.6"/>}
            {it.source==="stock"&&<NumIn label="C stock" value={it.stockConc} onChange={function(v){updItem(it.id,"stockConc",v)}} unit={it.stockConcU} units={CU} onUnitChange={function(v){updItem(it.id,"stockConcU",v)}} dark={dk}/>}
            <NumIn label="C finale" value={it.concFinal} onChange={function(v){updItem(it.id,"concFinal",v)}} unit={it.concFinalU} units={CU} onUnitChange={function(v){updItem(it.id,"concFinalU",v)}} dark={dk}/>
          </div>

          {result&&result.type==="mass"&&<div className={"px-3 py-2 rounded-lg text-sm font-mono font-semibold "+(dk?"bg-emerald-950/30 text-emerald-400":"bg-emerald-50 text-emerald-700")}>{it.name||"?"}: <strong>{result.val>=1e-3?sf(fB(result.val,MU,"mg"))+" mg":sf(fB(result.val,MU,"\u00b5g"))+" \u00b5g"}</strong></div>}
          {result&&result.type==="vol"&&<div className={"px-3 py-2 rounded-lg text-sm font-mono font-semibold "+(dk?"bg-emerald-950/30 text-emerald-400":"bg-emerald-50 text-emerald-700")}>{it.name||"?"}: <strong>{result.val>=1e-3?sf(fB(result.val,VU,"mL"))+" mL":sf(fB(result.val,VU,"\u00b5L"))+" \u00b5L"}</strong></div>}
          {result&&result.type==="err"&&<div className={"px-3 py-2 rounded-lg text-xs font-semibold "+(dk?"bg-red-950/30 text-red-400":"bg-red-50 text-red-600")}>C stock &lt; C finale</div>}
        </div>)
      })}
    </div>

    <Bt v="secondary" onClick={addItem} dark={dk} className="w-full">+ Ajouter un composant</Bt>

    {VF>0&&items.length>0&&(function(){
      var totalStockVol=0;
      items.forEach(function(it){
        if(it.source==="stock"){
          var cF2=tB(parseFloat(it.concFinal)||0,CU,it.concFinalU);
          var cS2=tB(parseFloat(it.stockConc)||0,CU,it.stockConcU);
          if(cS2>0&&cF2>0&&cS2>=cF2){totalStockVol+=(cF2*VF)/cS2}
        }
      });
      var solventVol=VF-totalStockVol;
      if(solventVol<0)solventVol=0;
      return(
        <div className={"p-4 rounded-xl border-2 border-dashed "+(dk?"border-blue-800 bg-blue-950/20":"border-blue-200 bg-blue-50/60")}>
          <div className={"text-[10px] font-semibold uppercase tracking-wider mb-2 "+(dk?"text-blue-400":"text-blue-600")}>Solvant (H2O / completeur)</div>
          <div className="flex items-baseline gap-2">
            <span className={"text-2xl font-mono font-bold "+(dk?"text-blue-300":"text-blue-700")}>{solventVol>=1e-3?sf(fB(solventVol,VU,"mL")):sf(fB(solventVol,VU,"\u00b5L"))}</span>
            <span className="text-sm font-semibold text-blue-500">{solventVol>=1e-3?"mL":"\u00b5L"}</span>
          </div>
          <div className={"text-[10px] mt-1 "+(dk?"text-blue-500/60":"text-blue-400")}>= Vol. final ({volFinal} {vfUnit}) - volumes stocks preleves</div>
        </div>
      )
    })()}

    <Bt onClick={function(){var detail=items.map(function(it){return it.name||"?"}).join(", ");ae({module:"Buffer",detail:"Prep "+volFinal+vfUnit+": "+detail})}} dark={dk}>Sauvegarder</Bt>
  </div>)
}

/* ══════════ MOD 7: REFERENCE (CRUD) ══════════ */
function ChemRef(p){
  var dk=p.dark,DB=p.db,extra=p.extra,saveExtra=p.saveExtra;
  var[fi,sFi]=useState("");var[cf,sCf]=useState("Tous");
  var[adding,setAdding]=useState(false);
  var[editId,setEditId]=useState(null);
  var[fn,sFn]=useState("");var[fmw,sFmw]=useState("");var[fc,sFc]=useState("");var[ff,sFf]=useState("");var[fsc,sFsc]=useState("");var[fwc,sFwc]=useState("");

  var cats=useMemo(function(){return["Tous"].concat(Array.from(new Set(DB.map(function(x){return x.c}))).sort())},[DB]);
  var fl=useMemo(function(){var l=DB;if(cf!=="Tous")l=l.filter(function(x){return x.c===cf});if(fi){var q=fi.toLowerCase();l=l.filter(function(x){return x.n.toLowerCase().indexOf(q)>=0||x.f.toLowerCase().indexOf(q)>=0})}return l},[fi,cf,DB]);

  function resetForm(){sFn("");sFmw("");sFc("");sFf("");sFsc("");sFwc("");setAdding(false);setEditId(null)}
  function handleAdd(){if(!fn||!fmw)return;var item={n:fn,mw:parseFloat(fmw)||0,c:fc||"Custom",f:ff||"",sc:fsc||undefined,wc:fwc||undefined};saveExtra(extra.concat([item]));resetForm()}
  function handleEdit(x,idx){setEditId(idx);setAdding(true);sFn(x.n);sFmw(String(x.mw));sFc(x.c);sFf(x.f);sFsc(x.sc||"");sFwc(x.wc||"")}
  function handleSaveEdit(){if(!fn||!fmw)return;var updated=extra.map(function(it,i){return i===editId?{n:fn,mw:parseFloat(fmw)||0,c:fc||"Custom",f:ff||"",sc:fsc||undefined,wc:fwc||undefined}:it});saveExtra(updated);resetForm()}
  function handleDelete(idx){saveExtra(extra.filter(function(_,i){return i!==idx}))}

  var isExtraItem=function(x){return extra.some(function(e){return e.n===x.n&&e.mw===x.mw})};
  var extraIndex=function(x){return extra.findIndex(function(e){return e.n===x.n&&e.mw===x.mw})};

  return(<div className="space-y-4">
    <div className="flex gap-2">
      <input type="text" value={fi} onChange={function(e){sFi(e.target.value)}} placeholder="Filtrer..." className={"flex-1 px-3 py-2 rounded-lg border text-sm outline-none "+(dk?"bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-600":"bg-white border-gray-300 text-gray-900 placeholder-gray-400")}/>
      <select value={cf} onChange={function(e){sCf(e.target.value)}} className={"px-3 py-2 rounded-lg border text-xs font-semibold outline-none "+(dk?"bg-gray-700 border-gray-600 text-gray-200":"bg-gray-50 border-gray-300 text-gray-700")}>{cats.map(function(c){return <option key={c} value={c}>{c}</option>})}</select>
      <Bt v="secondary" onClick={function(){setAdding(!adding);setEditId(null)}} dark={dk} className="text-xs">{adding?"Annuler":"+ Ajout"}</Bt>
    </div>

    {adding&&<div className={"p-4 rounded-xl border space-y-3 "+(dk?"border-blue-800 bg-blue-950/20":"border-blue-200 bg-blue-50/50")}>
      <div className={"text-xs font-semibold uppercase "+(dk?"text-blue-400":"text-blue-600")}>{editId!==null?"Modifier":"Nouveau produit"}</div>
      <div className="grid grid-cols-2 gap-3">
        <input value={fn} onChange={function(e){sFn(e.target.value)}} placeholder="Nom *" className={"px-3 py-2 rounded-lg border text-sm outline-none "+(dk?"bg-gray-800 border-gray-700 text-gray-100":"bg-white border-gray-300 text-gray-900")}/>
        <input value={fmw} onChange={function(e){sFmw(e.target.value)}} placeholder="M (g/mol) *" type="number" className={"px-3 py-2 rounded-lg border text-sm font-mono outline-none "+(dk?"bg-gray-800 border-gray-700 text-gray-100":"bg-white border-gray-300 text-gray-900")}/>
        <input value={fc} onChange={function(e){sFc(e.target.value)}} placeholder="Categorie" className={"px-3 py-2 rounded-lg border text-sm outline-none "+(dk?"bg-gray-800 border-gray-700 text-gray-100":"bg-white border-gray-300 text-gray-900")}/>
        <input value={ff} onChange={function(e){sFf(e.target.value)}} placeholder="Formule" className={"px-3 py-2 rounded-lg border text-sm outline-none "+(dk?"bg-gray-800 border-gray-700 text-gray-100":"bg-white border-gray-300 text-gray-900")}/>
        <input value={fsc} onChange={function(e){sFsc(e.target.value)}} placeholder="Conc. stock" className={"px-3 py-2 rounded-lg border text-sm outline-none "+(dk?"bg-gray-800 border-gray-700 text-gray-100":"bg-white border-gray-300 text-gray-900")}/>
        <input value={fwc} onChange={function(e){sFwc(e.target.value)}} placeholder="Conc. travail" className={"px-3 py-2 rounded-lg border text-sm outline-none "+(dk?"bg-gray-800 border-gray-700 text-gray-100":"bg-white border-gray-300 text-gray-900")}/>
      </div>
      <Bt onClick={editId!==null?handleSaveEdit:handleAdd} dark={dk}>{editId!==null?"Modifier":"Ajouter"}</Bt>
    </div>}

    <div className="flex items-center justify-between">
      <div className={"text-[10px] font-semibold "+(dk?"text-gray-600":"text-gray-400")}>{fl.length} / {DB.length}{extra.length>0?" ("+extra.length+" custom)":""}</div>
      {extra.length>0&&<button onClick={function(){if(confirm("Supprimer tous les produits custom ?"))saveExtra([])}} className={"text-[10px] font-semibold px-2 py-1 rounded-md transition-colors "+(dk?"text-red-500/60 hover:text-red-400 hover:bg-red-900/20":"text-red-400 hover:text-red-600 hover:bg-red-50")}>Supprimer tous les custom</button>}
    </div>
    <div className="max-h-[500px] overflow-y-auto space-y-1 pr-1">
      {fl.map(function(x,i){
        var isCustom=isExtraItem(x);
        var eidx=isCustom?extraIndex(x):-1;
        return(<div key={x.n+i} className={"px-3 py-2 rounded-lg flex items-center justify-between "+(dk?"bg-gray-800/50 hover:bg-gray-800":"bg-gray-50 hover:bg-gray-100")}>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={"text-sm font-semibold truncate "+(dk?"text-gray-200":"text-gray-800")}>{x.n}</span>
              {isCustom&&<span className={"text-[9px] px-1.5 py-0.5 rounded font-bold "+(dk?"bg-blue-900/40 text-blue-400":"bg-blue-100 text-blue-600")}>CUSTOM</span>}
            </div>
            <div className={"text-[10px] "+(dk?"text-gray-500":"text-gray-400")}>{x.f} | {x.c}{x.pk?" | pKa "+x.pk:""}{x.cm?" | CMC "+x.cm:""}</div>
            {(x.sc||x.wc)&&<div className="text-[10px] text-blue-500">{x.sc?"Stock: "+x.sc:""}{x.wc?" | Work: "+x.wc:""}</div>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className={"text-sm font-mono font-bold "+(dk?"text-emerald-400":"text-emerald-600")}>{x.mw<1000?x.mw:x.mw.toLocaleString()}</span>
            {isCustom&&<div className="flex gap-1">
              <button onClick={function(){handleEdit(x,eidx)}} title="Modifier" className={"p-1.5 rounded-md transition-colors "+(dk?"text-gray-500 hover:text-blue-400 hover:bg-blue-900/30":"text-gray-400 hover:text-blue-600 hover:bg-blue-50")}><Svg s={13}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></Svg></button>
              <button onClick={function(){handleDelete(eidx)}} title="Supprimer" className={"p-1.5 rounded-md transition-colors "+(dk?"text-gray-500 hover:text-red-400 hover:bg-red-900/30":"text-gray-400 hover:text-red-500 hover:bg-red-50")}><Svg s={13}><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></Svg></button>
            </div>}
          </div>
        </div>)
      })}
    </div>
  </div>)
}

/* ══════════ MOD 8: MILIEUX DE CULTURE ══════════ */
var MEDIA_DB = [
  // ── Bacteries ──
  {name:"LB (Luria-Bertani)",cat:"Bacteries",ph:"7.0",comps:[{n:"Tryptone",q:"10",u:"g/L",src:"powder"},{n:"Extrait de levure",q:"5",u:"g/L",src:"powder"},{n:"NaCl",q:"10",u:"g/L",src:"powder"}],note:"Milieu riche universel pour la culture de routine d'E. coli et de nombreuses enterobacteries. Base de la plupart des protocoles de clonage, expression et transformation. Le tryptone fournit les peptides (digestion trypsique de caseine), l'extrait de levure apporte vitamines et cofacteurs. Ajuster le pH a 7.0 avec NaOH avant autoclavage (121C, 15min). Pour LB-agar, ajouter 15 g/L d'agar avant autoclavage. Les antibiotiques sont ajoutes apres refroidissement a ~55C."},
  {name:"LB Low Salt",cat:"Bacteries",ph:"7.0",comps:[{n:"Tryptone",q:"10",u:"g/L",src:"powder"},{n:"Extrait de levure",q:"5",u:"g/L",src:"powder"},{n:"NaCl",q:"5",u:"g/L",src:"powder"}],note:"Variante du LB a faible teneur en sel (5 g/L au lieu de 10 g/L). Indispensable pour la selection a la zeocine (Sh ble) car une concentration elevee en sel inactive cet antibiotique. Egalement recommande pour la selection a l'hygromycine B. Le pH doit etre ajuste a 7.5 pour une activite optimale de la zeocine. Meme protocole de preparation que le LB standard."},
  {name:"2xYT",cat:"Bacteries",ph:"7.0",comps:[{n:"Tryptone",q:"16",u:"g/L",src:"powder"},{n:"Extrait de levure",q:"10",u:"g/L",src:"powder"},{n:"NaCl",q:"5",u:"g/L",src:"powder"}],note:"Milieu double-richesse en nutriments par rapport au LB. Meilleure croissance et rendement en biomasse, particulierement recommande pour la production de phages M13, la preparation de cellules competentes et l'expression de proteines recombinantes en phase mid-log. Le ratio peptone/levure plus eleve fournit davantage d'acides amines et de facteurs de croissance. Autoclavage standard."},
  {name:"TB (Terrific Broth)",cat:"Bacteries",ph:"7.2",comps:[{n:"Tryptone",q:"12",u:"g/L",src:"powder"},{n:"Extrait de levure",q:"24",u:"g/L",src:"powder"},{n:"Glycerol",q:"4",u:"mL/L",src:"liquid"},{n:"KH2PO4",q:"2.31",u:"g/L",src:"powder"},{n:"K2HPO4",q:"12.54",u:"g/L",src:"powder"}],note:"Milieu haute densite pour l'expression de proteines recombinantes a haut rendement. La haute concentration en extrait de levure et le glycerol comme source de carbone supplementaire permettent d'atteindre des DO600 de 10-15. Le tampon phosphate de potassium (72 mM, pH 7.2) stabilise le pH pendant la croissance. IMPORTANT: preparer les sels phosphate en solution 10x separee, autoclaver separement et melanger apres refroidissement pour eviter la precipitation. La phase de croissance exponentielle est prolongee par rapport au LB."},
  {name:"SOC",cat:"Bacteries",ph:"7.0",comps:[{n:"Tryptone",q:"20",u:"g/L",src:"powder"},{n:"Extrait de levure",q:"5",u:"g/L",src:"powder"},{n:"NaCl",q:"0.5",u:"g/L",src:"powder"},{n:"KCl",q:"0.186",u:"g/L",src:"powder"},{n:"MgCl2",q:"0.952",u:"g/L",src:"powder"},{n:"MgSO4",q:"1.204",u:"g/L",src:"powder"},{n:"Glucose",q:"3.603",u:"g/L",src:"powder"}],note:"Milieu de recuperation apres transformation bacterienne (choc thermique ou electroporation). Le glucose (20 mM) fournit une source d'energie immediate pour la reparation cellulaire et le Mg2+ (10 mM total) stabilise les membranes. Preparer le milieu de base (SOB) et autoclaver, puis ajouter sterillement MgCl2 (1M) et glucose (1M ou 20%) apres refroidissement. Incuber les cellules transformees 1h a 37C sous agitation (200 rpm) avant etalement. Critique pour les efficacites de transformation optimales."},
  {name:"SOB",cat:"Bacteries",ph:"7.0",comps:[{n:"Tryptone",q:"20",u:"g/L",src:"powder"},{n:"Extrait de levure",q:"5",u:"g/L",src:"powder"},{n:"NaCl",q:"0.5",u:"g/L",src:"powder"},{n:"KCl",q:"0.186",u:"g/L",src:"powder"},{n:"MgCl2",q:"0.952",u:"g/L",src:"powder"},{n:"MgSO4",q:"1.204",u:"g/L",src:"powder"}],note:"Base du milieu SOC sans glucose. Utilise pour la preparation de cellules competentes (methode Inoue, protocole Hanahan). Le faible NaCl et la presence de Mg2+ sont essentiels pour l'integrite membranaire. Le Mg est ajoute apres autoclavage sous forme de solution sterile 2M. Egalement utilise comme milieu de pre-culture avant transformation."},
  {name:"M9 Minimal",cat:"Bacteries",ph:"7.4",comps:[{n:"Na2HPO4.7H2O",q:"12.8",u:"g/L",src:"powder"},{n:"KH2PO4",q:"3",u:"g/L",src:"powder"},{n:"NaCl",q:"0.5",u:"g/L",src:"powder"},{n:"NH4Cl",q:"1",u:"g/L",src:"powder"},{n:"MgSO4 (1M)",q:"2",u:"mL/L",src:"liquid"},{n:"CaCl2 (1M)",q:"0.1",u:"mL/L",src:"liquid"},{n:"Glucose (20%)",q:"20",u:"mL/L",src:"liquid"}],note:"Milieu mineral defini pour etudes metaboliques, marquage isotopique (15N, 13C) et experiences de regulation genetique. La source d'azote unique (NH4Cl) et de carbone (glucose) permettent un controle precis de la croissance. Preparer les sels 5x, autoclaver, puis ajouter sterillement MgSO4 (1M), CaCl2 (1M), et la source de carbone (glucose 20% filtre). Pour le marquage, remplacer NH4Cl par 15NH4Cl et/ou glucose par 13C-glucose. Ajouter thiamine (1 ug/mL) pour les souches auxotrophes. Temps de generation ~60 min pour E. coli K-12."},
  {name:"BHI (Brain Heart Infusion)",cat:"Bacteries",ph:"7.4",comps:[{n:"BHI poudre",q:"37",u:"g/L",src:"powder"}],note:"Milieu tres riche a base d'infusion de cerveau et coeur de boeuf, additionne de peptone et glucose. Standard pour la culture de pathogenes exigeants: Listeria monocytogenes, streptocoques (dont S. pneumoniae), staphylocoques, enterococques, Neisseria, Haemophilus (avec supplements X et V). Egalement utilise pour les hemocultures et la preparation d'inocula. Autoclavage 121C 15min. Pour BHI-agar, ajouter 15 g/L d'agar. Ne pas surchauffer car les sucres peuvent carameliser."},
  {name:"MH (Mueller-Hinton)",cat:"Bacteries",ph:"7.3",comps:[{n:"MH poudre",q:"21",u:"g/L",src:"powder"}],note:"Milieu de reference internationale pour les tests de sensibilite aux antibiotiques (antibiogramme) selon les normes CLSI et EUCAST. Sa composition en amidon absorbe les metabolites toxiques, et sa faible teneur en inhibiteurs de sulfonamides et trimethoprime en fait le milieu ideal pour les CMI. Pour les organismes exigeants, utiliser MH-F (MH + sang de cheval 5% + beta-NAD 20 mg/L). L'epaisseur de la gelose doit etre exactement 4 mm pour la diffusion en disque. Le pH final doit etre verifie a 7.2-7.4 a 25C."},
  {name:"TSB (Tryptic Soy Broth)",cat:"Bacteries",ph:"7.3",comps:[{n:"TSB poudre",q:"30",u:"g/L",src:"powder"}],note:"Milieu polyvalent a base de digests de caseine et de soja, enrichi en glucose et NaCl. Supporte la croissance d'un large spectre de bacteries aerobies et anaerobies facultatives. Utilise comme milieu de reference pour les controles de sterilite (Pharmacopee), la culture de Staphylococcus aureus, Pseudomonas aeruginosa, et comme base pour les milieux enrichis (TSB + sang). Pour TSA (Tryptic Soy Agar), ajouter 15 g/L d'agar. Autoclavage standard 121C 15min."},
  {name:"NB (Nutrient Broth)",cat:"Bacteries",ph:"6.8",comps:[{n:"Extrait de viande",q:"1",u:"g/L",src:"powder"},{n:"Extrait de levure",q:"2",u:"g/L",src:"powder"},{n:"Peptone",q:"5",u:"g/L",src:"powder"},{n:"NaCl",q:"5",u:"g/L",src:"powder"}],note:"Milieu general relativement pauvre, adapte a la maintenance de souches non-exigeantes et aux etudes de croissance en conditions limitantes. Composition simple et reproductible. Utilise dans les protocoles pedagogiques et pour la culture de Bacillus, certains Pseudomonas et enterobacteries. Faible cout de production. Pour Nutrient Agar, ajouter 15 g/L d'agar. Non recommande pour les bacteries fastidieuses ou les pathogenes exigeants."},
  {name:"MacConkey",cat:"Bacteries",ph:"7.1",comps:[{n:"MacConkey poudre",q:"50",u:"g/L",src:"powder"}],note:"Milieu selectif et differentiel. Les sels biliaires et le cristal violet inhibent les bacteries Gram-positives. Le lactose et l'indicateur rouge neutre permettent de differencier les fermenteurs du lactose (colonies roses/rouges: E. coli, Klebsiella) des non-fermenteurs (colonies incolores/transparentes: Salmonella, Shigella, Pseudomonas). Essentiel en microbiologie clinique pour l'isolement primaire a partir de selles, urines et prelevements polymicrobiens. Ne pas autoclaver au-dela de 121C/15min pour preserver les proprietes differentielles."},
  {name:"LA (LB Agar)",cat:"Bacteries",ph:"7.0",comps:[{n:"Tryptone",q:"10",u:"g/L",src:"powder"},{n:"Extrait de levure",q:"5",u:"g/L",src:"powder"},{n:"NaCl",q:"10",u:"g/L",src:"powder"},{n:"Agar",q:"15",u:"g/L",src:"powder"}],note:"Version solide du LB, base pour la quasi-totalite des boites de selection en biologie moleculaire. Dissoudre les composants, ajuster pH 7.0 avec NaOH 5N, autoclaver. Laisser refroidir a ~55C dans un bain-marie avant d'ajouter les antibiotiques, IPTG (0.1-1 mM) et/ou X-Gal (40 ug/mL) pour le criblage bleu/blanc. Couler ~25 mL par boite de 90mm (epaisseur ~4mm). Les boites se conservent 4-6 semaines a 4C en sac plastique (sans antibiotique) ou 1-2 semaines (avec antibiotique)."},
  // ── Levures ──
  {name:"YPD (YEPD)",cat:"Levures",ph:"6.5",comps:[{n:"Extrait de levure",q:"10",u:"g/L",src:"powder"},{n:"Peptone",q:"20",u:"g/L",src:"powder"},{n:"Glucose",q:"20",u:"g/L",src:"powder"}],note:"Milieu riche de reference pour Saccharomyces cerevisiae et la plupart des levures de laboratoire. L'extrait de levure fournit vitamines B et acides amines, la peptone apporte une source d'azote complexe, et le glucose 2% est la source de carbone fermentable. Croissance optimale a 30C. Pour les milieux solides, ajouter 20 g/L d'agar. IMPORTANT: autoclaver le glucose separement (ou ajouter du glucose sterile apres autoclave) pour eviter les reactions de Maillard (brunissement) qui peuvent inhiber la croissance. Temps de generation ~90 min en phase exponentielle."},
  {name:"YPD + Agar",cat:"Levures",ph:"6.5",comps:[{n:"Extrait de levure",q:"10",u:"g/L",src:"powder"},{n:"Peptone",q:"20",u:"g/L",src:"powder"},{n:"Glucose",q:"20",u:"g/L",src:"powder"},{n:"Agar",q:"20",u:"g/L",src:"powder"}],note:"Version solide du YPD pour les boites de Petri. Concentration d'agar legerement superieure (20 g/L vs 15 g/L) car le pH plus acide des milieux levure necessite plus d'agar pour une bonne gelification. Meme protocole de sterilisation. Laisser refroidir a ~55C avant coulage. Pour la selection a la geneticine (G418), ajouter 200-400 ug/mL apres refroidissement. Les boites YPD se conservent bien 2-3 semaines a 4C."},
  {name:"YPG (Glycerol)",cat:"Levures",ph:"6.5",comps:[{n:"Extrait de levure",q:"10",u:"g/L",src:"powder"},{n:"Peptone",q:"20",u:"g/L",src:"powder"},{n:"Glycerol",q:"30",u:"mL/L",src:"liquid"}],note:"Milieu riche avec glycerol (3%) comme source de carbone non-fermentable a la place du glucose. Force la respiration mitochondriale et empeche la fermentation. Utilise pour: verifier la competence mitochondriale (les mutants petites rho-/rho0 ne poussent pas), etudier le metabolisme oxydatif, et distinguer les mutants respiratoires. Croissance plus lente que sur YPD. Egalement utilise avec ethanol 2-3% (YPE) pour les memes applications. Incuber 2-3 jours a 30C minimum."},
  {name:"SD (Synthetic Defined)",cat:"Levures",ph:"5.8",comps:[{n:"YNB sans AA",q:"6.7",u:"g/L",src:"powder"},{n:"Glucose",q:"20",u:"g/L",src:"powder"},{n:"Dropout mix",q:"variable",u:"",src:"powder"}],note:"Milieu synthetique minimal pour la selection de marqueurs auxotrophes chez la levure. Le YNB (Yeast Nitrogen Base) fournit sels mineraux, vitamines et sulfate d'ammonium comme source d'azote. Le dropout mix contient tous les acides amines et bases SAUF celui/ceux utilise(s) comme marqueur(s) de selection (URA3, LEU2, TRP1, HIS3, LYS2, ADE2). Par exemple, SD-Ura selectionne les transformants portant le marqueur URA3. Ajuster pH a 5.8 avec NaOH. Filtrer-steriliser si possible (le YNB est thermosensible) ou autoclaver brievement. Ajouter 20 g/L d'agar pour milieu solide."},
  {name:"SC (Synthetic Complete)",cat:"Levures",ph:"5.8",comps:[{n:"YNB sans AA",q:"6.7",u:"g/L",src:"powder"},{n:"Glucose",q:"20",u:"g/L",src:"powder"},{n:"Acides amines complets",q:"2",u:"g/L",src:"powder"}],note:"Version complete du milieu SD avec tous les acides amines et bases nucleotidiques. Sert de controle positif de croissance et de milieu defini pour les experiences ou la composition precise du milieu est necessaire (contrairement au YPD). Le mix complet inclut typiquement: adenine, uracile, tryptophane, histidine, leucine, lysine, methionine, et tous les autres acides amines standards. Utilise pour la pre-culture avant passage en milieu selectif. Meme preparation que le SD."},
  {name:"YPD + G418",cat:"Levures",ph:"6.5",comps:[{n:"Extrait de levure",q:"10",u:"g/L",src:"powder"},{n:"Peptone",q:"20",u:"g/L",src:"powder"},{n:"Glucose",q:"20",u:"g/L",src:"powder"},{n:"G418",q:"200",u:"mg/L",src:"powder"}],note:"YPD additionne de geneticine (G418) pour la selection des levures portant la cassette de resistance KanMX (gene kanR de Tn903). Concentration standard 200 ug/mL, mais peut varier de 100 a 400 ug/mL selon la souche et le niveau d'expression. CRITIQUE: le G418 est inactive par l'autoclavage, toujours l'ajouter apres refroidissement a ~55C pour le solide, ou apres autoclave pour le liquide. Les cellules doivent etre en phase active pour etre sensibles; pre-cultiver en YPD 4-6h avant de plaquer. Le G418 perd de l'activite au stockage; les boites ne se conservent que 1-2 semaines a 4C."},
  // ── Mycologie ──
  {name:"SDA (Sabouraud Dextrose Agar)",cat:"Mycologie",ph:"5.6",comps:[{n:"Peptone",q:"10",u:"g/L",src:"powder"},{n:"Glucose (Dextrose)",q:"40",u:"g/L",src:"powder"},{n:"Agar",q:"15",u:"g/L",src:"powder"}],note:"Milieu de reference pour l'isolement et la culture des champignons filamenteux et des levures pathogenes. Le pH acide (5.6) et la forte concentration en glucose (4%) inhibent naturellement la plupart des bacteries. Formule originale de Raymond Sabouraud (1892) pour les dermatophytes. Utilise pour: isolement de Candida spp., dermatophytes (Trichophyton, Microsporum, Epidermophyton), et champignons dimorphiques. Pour augmenter la selectivite, ajouter chloramphenicol (50 ug/mL) et/ou cycloheximide (actidione, 500 ug/mL). Incubation 25-30C, verifier les cultures jusqu'a 4 semaines pour les champignons a croissance lente."},
  {name:"SDB (Sabouraud Dextrose Broth)",cat:"Mycologie",ph:"5.6",comps:[{n:"Peptone",q:"10",u:"g/L",src:"powder"},{n:"Glucose (Dextrose)",q:"20",u:"g/L",src:"powder"}],note:"Version liquide du Sabouraud, avec concentration de glucose reduite a 2% (standard) pour la culture en suspension de levures et champignons filamenteux. Utilise pour la propagation de biomasse fongique, la preparation d'inocula standardises pour les tests antifongiques, et les cultures agitees. La croissance en milieu liquide permet d'obtenir des suspensions homogenes de Candida pour les tests de sensibilite aux antifongiques (methode de microdilution). Incuber a 30C sous agitation moderee (150-200 rpm) pour les champignons filamenteux."},
  {name:"PDA (Potato Dextrose Agar)",cat:"Mycologie",ph:"5.6",comps:[{n:"Infusion pomme de terre",q:"200",u:"g/L",src:"powder"},{n:"Glucose",q:"20",u:"g/L",src:"powder"},{n:"Agar",q:"15",u:"g/L",src:"powder"}],note:"Milieu naturel riche favorisant la sporulation et la pigmentation des champignons filamenteux. L'infusion de pomme de terre fournit amidon et facteurs de croissance qui stimulent la production de conidies et la coloration caracteristique des colonies (essentiel pour l'identification morphologique). Utilise pour: identification de Fusarium, Aspergillus, Penicillium et champignons phytopathogenes. Preparation de l'infusion maison: faire bouillir 200g de pommes de terre epluchees dans 1L d'eau 30 min, filtrer, ajouter glucose et agar. Ou utiliser la poudre commerciale deshydratee (39 g/L). Incubation 25C, 5-14 jours."},
  {name:"PDB (Potato Dextrose Broth)",cat:"Mycologie",ph:"5.1",comps:[{n:"PDB poudre",q:"24",u:"g/L",src:"powder"}],note:"Version liquide du PDA pour la culture en suspension de champignons filamenteux. Utilise pour la production de biomasse mycilienne, l'extraction de metabolites secondaires (mycotoxines, antibiotiques fongiques), et la preparation de filtrats de culture. La culture agitee (150 rpm, 25-28C) produit des pellets myciliens ou une croissance dispersee selon l'espece et les conditions. Pour les champignons entomopathogenes (Beauveria, Metarhizium), c'est le milieu de production standard de blastospores et conidies submergees."},
  {name:"CYA (Czapek Yeast Agar)",cat:"Mycologie",ph:"6.2",comps:[{n:"Saccharose",q:"30",u:"g/L",src:"powder"},{n:"NaNO3",q:"3",u:"g/L",src:"powder"},{n:"K2HPO4",q:"1",u:"g/L",src:"powder"},{n:"MgSO4.7H2O",q:"0.5",u:"g/L",src:"powder"},{n:"KCl",q:"0.5",u:"g/L",src:"powder"},{n:"FeSO4.7H2O",q:"0.01",u:"g/L",src:"powder"},{n:"Extrait de levure",q:"5",u:"g/L",src:"powder"},{n:"Agar",q:"15",u:"g/L",src:"powder"}],note:"Milieu semi-synthetique standard pour l'identification taxonomique des Aspergillus et Penicillium (methode de Pitt et Samson). Le saccharose comme unique source de carbone et le nitrate de sodium comme source d'azote inorganique produisent des morphologies coloniales et des pigmentations diagnostiques. Les colonies sont evaluees apres 7 jours a 25C et 37C (thermotolerance). Le CYA fait partie du protocole standardise d'identification tri-point (CYA, MEA, G25N) recommande par le Fungal Biodiversity Centre (CBS). L'ajout d'extrait de levure (variante CY20S) ameliore la croissance des especes exigeantes."},
  {name:"MEA (Malt Extract Agar)",cat:"Mycologie",ph:"5.4",comps:[{n:"Extrait de malt",q:"20",u:"g/L",src:"powder"},{n:"Glucose",q:"20",u:"g/L",src:"powder"},{n:"Peptone",q:"1",u:"g/L",src:"powder"},{n:"Agar",q:"20",u:"g/L",src:"powder"}],note:"Milieu favorisant la sporulation et la production de pigments chez les champignons. L'extrait de malt, riche en maltose et dextrines, fournit un substrat complexe qui stimule la differentiation (formation de tetes aspergillaires, penicilles, et structures reproductrices). Fait partie du jeu de milieux standardises pour l'identification des moisissures (avec CYA et G25N). Les caracteres macromorphologiques (diametre, texture, couleur recto/verso, exsudat, pigment diffusible) sont notes apres 7 jours a 25C. Le pH relativement acide (5.4) favorise les champignons par rapport aux bacteries contaminantes."},
  {name:"RPMI 1640 + MOPS",cat:"Mycologie",ph:"7.0",comps:[{n:"RPMI 1640 poudre",q:"10.4",u:"g/L",src:"powder"},{n:"MOPS",q:"34.53",u:"g/L",src:"powder"},{n:"Glucose",q:"18",u:"g/L",src:"powder"}],note:"Milieu de reference CLSI (documents M27 et M38) et EUCAST pour la determination des CMI des antifongiques contre levures (Candida, Cryptococcus) et moisissures (Aspergillus, Fusarium). Le RPMI 1640 est un milieu de culture cellulaire qui fournit acides amines, vitamines et sels. Le tampon MOPS (0.165M) maintient le pH a 7.0 pendant la croissance. CRITIQUE: ne PAS autoclaver, toujours steriliser par filtration (0.22 um) car le milieu contient du glucose et des acides amines thermolabiles. Supplementer en glucose a 2% final (la formulation standard contient 0.2% seulement). Conservation 1 mois a 4C."},
  // ── Culture de tissus vegetaux ──
  {name:"MS (Murashige & Skoog)",cat:"Plantes",ph:"5.7",comps:[{n:"MS macro sels",q:"4.33",u:"g/L",src:"powder"},{n:"MS micro sels",q:"inclus",u:"",src:"powder"},{n:"Vitamines MS (thiamine, pyridoxine, ac. nicotinique, glycine)",q:"inclus",u:"",src:"powder"},{n:"myo-Inositol",q:"0.1",u:"g/L",src:"powder"},{n:"Saccharose",q:"30",u:"g/L",src:"powder"},{n:"Agar (Phytagel)",q:"8",u:"g/L",src:"powder"}],note:"Milieu de reference universel pour la culture in vitro de tissus vegetaux, developpe en 1962 par Murashige et Skoog pour le tabac (Nicotiana tabacum). Contient des concentrations elevees en nitrate (NO3- 39.4 mM) et ammonium (NH4+ 20.6 mM) comme sources d'azote, plus 13 microelements (Fe-EDTA, Mn, Zn, B, Cu, Co, Mo, I). Le saccharose 3% sert de source de carbone (les explants ne sont pas autotrophes in vitro). Le pH est critique: ajuster a 5.7 avec KOH 1N AVANT autoclavage (le pH baisse de ~0.3-0.5 unites apres). Utiliser du Phytagel (2.5 g/L) ou agar plant (6-8 g/L) pour la gelification. Ajouter les hormones (auxines/cytokinines) avant autoclavage sauf IAA et GA3 (thermolabiles, filtrer-steriliser). Milieu de base pour micropropagation, organogenese, embryogenese somatique et transformation genetique de la majorite des especes vegetales."},
  {name:"MS + BAP + NAA (Multiplication)",cat:"Plantes",ph:"5.7",comps:[{n:"MS sels + vitamines",q:"4.43",u:"g/L",src:"powder"},{n:"myo-Inositol",q:"0.1",u:"g/L",src:"powder"},{n:"Saccharose",q:"30",u:"g/L",src:"powder"},{n:"BAP (6-Benzylaminopurine)",q:"1",u:"mg/L",src:"powder"},{n:"NAA (acide naphtaleneacetique)",q:"0.1",u:"mg/L",src:"powder"},{n:"Agar",q:"8",u:"g/L",src:"powder"}],note:"Milieu MS supplementeen cytokinines pour la multiplication vegetative (micropropagation). Le rapport cytokinines/auxines eleve (BAP 1 mg/L >> NAA 0.1 mg/L) favorise la proliferation de bourgeons axillaires et adventifs. Utilise pour la multiplication de masse in vitro d'especes ornementales (orchidees, roses), fruitieres (bananiers, fraisiers) et forestieres. Le BAP (ou BA) est la cytokinine la plus utilisee; alternatives: kinétine, TDZ (thidiazuron) pour les especes recalcitrantes. La concentration optimale varie selon l'espece (0.5-5 mg/L BAP). Subcultures toutes les 3-4 semaines. Taux de multiplication typique: 3-8x par cycle selon l'espece."},
  {name:"MS + IBA (Enracinement)",cat:"Plantes",ph:"5.7",comps:[{n:"MS sels demi-force",q:"2.22",u:"g/L",src:"powder"},{n:"myo-Inositol",q:"0.05",u:"g/L",src:"powder"},{n:"Saccharose",q:"20",u:"g/L",src:"powder"},{n:"IBA (acide indole-3-butyrique)",q:"0.5",u:"mg/L",src:"powder"},{n:"Agar",q:"8",u:"g/L",src:"powder"}],note:"Milieu d'enracinement a demi-force en sels MS. La reduction de la concentration en sels mineraux et en saccharose (2% au lieu de 3%) stimule la rhizogenese. L'IBA (acide indole-3-butyrique) est l'auxine de choix pour l'enracinement car elle est plus stable et moins phytotoxique que l'IAA ou le 2,4-D. Concentrations typiques: 0.1-2 mg/L selon l'espece. Certaines especes s'enracinent mieux sur milieu sans hormones (enracinement spontane) ou en presence de charbon actif (0.5-1 g/L) qui adsorbe les inhibiteurs. L'enracinement prend 2-4 semaines. Les plantules enracinees sont ensuite acclimatees progressivement en conditions ex vitro (humidity dome, substrat sterile)."},
  {name:"MS + 2,4-D (Callogénèse)",cat:"Plantes",ph:"5.7",comps:[{n:"MS sels + vitamines",q:"4.43",u:"g/L",src:"powder"},{n:"myo-Inositol",q:"0.1",u:"g/L",src:"powder"},{n:"Saccharose",q:"30",u:"g/L",src:"powder"},{n:"2,4-D (acide 2,4-dichlorophenoxyacetique)",q:"2",u:"mg/L",src:"powder"},{n:"Agar",q:"8",u:"g/L",src:"powder"}],note:"Milieu d'induction de cal (tissu indifferencie). Le 2,4-D est une auxine synthetique puissante qui provoque la dedifferenciation cellulaire et la formation de cal a partir de divers explants (feuilles, tiges, racines, embryons immatures). Concentrations typiques: 0.5-5 mg/L. Le cal obtenu peut etre maintenu par subcultures regulieres (3-4 semaines) et oriente vers l'embryogenese somatique en retirant le 2,4-D et en transferant sur milieu avec BAP. Le 2,4-D est egalement utilise pour l'induction d'embryons somatiques chez les cereales (ble, mais, riz), les palmiers (palmier a huile, dattier) et les coniferes. ATTENTION: le 2,4-D est un herbicide a forte concentration, manipuler avec precaution. Filtrer-steriliser ou autoclaver brievement (stable a la chaleur)."},
  {name:"B5 (Gamborg)",cat:"Plantes",ph:"5.5",comps:[{n:"B5 macro sels",q:"3.21",u:"g/L",src:"powder"},{n:"B5 micro sels",q:"inclus",u:"",src:"powder"},{n:"Vitamines B5 (thiamine 10mg/L, pyridoxine 1mg/L, ac. nicotinique 1mg/L)",q:"inclus",u:"",src:"powder"},{n:"myo-Inositol",q:"0.1",u:"g/L",src:"powder"},{n:"Saccharose",q:"20",u:"g/L",src:"powder"},{n:"Agar",q:"8",u:"g/L",src:"powder"}],note:"Milieu developpe par Gamborg et al. (1968) pour la culture de cellules en suspension de soja (Glycine max). Differences majeures avec le MS: concentration en ammonium beaucoup plus faible (NH4+ 2 mM vs 20.6 mM dans MS), thiamine 10x plus elevee (10 mg/L), et KNO3 comme source d'azote principale (25 mM). Ces caracteristiques le rendent mieux adapte aux legumineuses (soja, pois, luzerne) et aux especes sensibles a l'ammonium. Le saccharose est generalement a 2% (vs 3% pour MS). Egalement recommande pour la culture de protoplastes et les suspensions cellulaires. Le milieu B5 est souvent modifie avec les vitamines MS pour un compromis (sels B5 + vitamines MS)."},
  {name:"WPM (Woody Plant Medium)",cat:"Plantes",ph:"5.2",comps:[{n:"WPM sels",q:"2.46",u:"g/L",src:"powder"},{n:"Vitamines MS",q:"inclus",u:"",src:"powder"},{n:"myo-Inositol",q:"0.1",u:"g/L",src:"powder"},{n:"Saccharose",q:"30",u:"g/L",src:"powder"},{n:"Agar (Phytagel)",q:"8",u:"g/L",src:"powder"}],note:"Milieu developpe par Lloyd et McCown (1980) specifiquement pour la micropropagation d'especes ligneuses (arbres et arbustes). Les concentrations en sels sont globalement plus faibles que le MS (environ la moitie), avec moins de nitrate et d'ammonium, ce qui evite la toxicite saline observee chez de nombreuses especes forestieres et fruitieres. Recommande pour: chene, bouleau, erable, rhododendron, bleuet (Vaccinium), noyer, chateignier, eucalyptus, et de nombreux fruitiers. Le calcium et le soufre sont fournis sous forme de Ca(NO3)2 et CaSO4 (au lieu de CaCl2 dans le MS). pH ajuste a 5.2. Hormones typiques pour multiplication: BAP 0.5-2 mg/L ou TDZ 0.01-0.1 mg/L pour les especes difficiles."},
  {name:"DKW (Driver & Kuniyuki)",cat:"Plantes",ph:"5.5",comps:[{n:"DKW sels",q:"5.23",u:"g/L",src:"powder"},{n:"Vitamines DKW",q:"inclus",u:"",src:"powder"},{n:"myo-Inositol",q:"0.1",u:"g/L",src:"powder"},{n:"Saccharose",q:"30",u:"g/L",src:"powder"},{n:"Agar",q:"8",u:"g/L",src:"powder"}],note:"Milieu developpe par Driver et Kuniyuki (1984) pour la culture in vitro du noyer (Juglans). Caracteristiques: concentration en calcium tres elevee (comparee au MS et WPM) sous forme de Ca(NO3)2, ce qui previent la necrose apicale frequente chez le noyer et autres Juglandaceae. Egalement riche en soufre (MgSO4 + thiamine). Devenu le milieu de reference pour les Juglandaceae (noyer commun, noyer noir, pecanier) et donne de bons resultats sur cerisier, prunier, et certains Prunus. Souvent utilise avec BAP (1-5 uM) + IBA (0.01-0.1 uM) pour la multiplication. La thiamine (2 mg/L) et l'acide nicotinique (1 mg/L) sont plus concentres que dans le MS."},
  {name:"N6 (Chu)",cat:"Plantes",ph:"5.8",comps:[{n:"N6 macro sels",q:"3.96",u:"g/L",src:"powder"},{n:"N6 micro sels",q:"inclus",u:"",src:"powder"},{n:"Vitamines N6 (thiamine 1mg/L, pyridoxine 0.5mg/L, glycine 2mg/L)",q:"inclus",u:"",src:"powder"},{n:"Saccharose",q:"50",u:"g/L",src:"powder"},{n:"Agar",q:"8",u:"g/L",src:"powder"}],note:"Milieu developpe par Chu et al. (1975) pour la culture d'antheres et la production d'haploides chez le riz (Oryza sativa). Caracteristiques specifiques: haute concentration en KNO3 (28 mM) mais absence de NH4NO3 (remplace par (NH4)2SO4 a 3.5 mM), et saccharose a 5% (plus eleve que MS). Devenu le milieu standard pour: androgenese (culture d'antheres/microspores) chez les cereales (riz, ble, orge), induction de cal embryogenique chez le riz et le mais, et regeneration de plantes haploides doublees. Pour l'androgenese du riz: N6 + 2,4-D 2 mg/L + caseine hydrolysee 500 mg/L + proline 500 mg/L. Les antheres au stade uninuclee sont cultivees a 25C dans l'obscurite pendant 3-4 semaines pour l'induction de cal."},
  {name:"LS (Linsmaier & Skoog)",cat:"Plantes",ph:"5.7",comps:[{n:"MS macro sels",q:"4.33",u:"g/L",src:"powder"},{n:"MS micro sels",q:"inclus",u:"",src:"powder"},{n:"Thiamine-HCl",q:"0.4",u:"mg/L",src:"powder"},{n:"myo-Inositol",q:"0.1",u:"g/L",src:"powder"},{n:"Saccharose",q:"30",u:"g/L",src:"powder"},{n:"Agar",q:"8",u:"g/L",src:"powder"}],note:"Version simplifiee du milieu MS developpee par Linsmaier et Skoog (1965). Memes sels mineraux que le MS mais vitamines reduites a la seule thiamine (0.4 mg/L) et myo-inositol (100 mg/L), la pyridoxine, l'acide nicotinique et la glycine ayant ete demontres non essentiels pour la plupart des cultures. Utilise comme alternative au MS quand la simplification du milieu est souhaitee. Particulierement recommande pour les cultures de tabac (Nicotiana), carotte (Daucus carota), et les etudes fondamentales sur la nutrition minerale in vitro. Meme preparation que le MS: ajuster pH 5.7, autoclaver 121C 15min."},
  {name:"White",cat:"Plantes",ph:"5.5",comps:[{n:"White sels",q:"0.74",u:"g/L",src:"powder"},{n:"Vitamines White (thiamine, pyridoxine, ac. nicotinique, glycine)",q:"inclus",u:"",src:"powder"},{n:"Saccharose",q:"20",u:"g/L",src:"powder"},{n:"Agar",q:"8",u:"g/L",src:"powder"}],note:"Un des premiers milieux developpes pour la culture de tissus vegetaux (White, 1943), initialement concu pour la culture de racines excisees de tomate. Concentrations minerales tres faibles comparees au MS (environ 6x moins de sels totaux). Malgre son anciennete, il reste utilise pour: la culture de racines isolees, la culture d'organes (ovules, embryons), et comme milieu de base pour certaines especes tropicales sensibles aux fortes concentrations de sels. Contient du glycerophosphate de sodium comme source de phosphore (unique parmi les milieux classiques). Egalement utilise pour la culture de tissus de gymnospermes (coniferes) qui preferent les milieux dilues."},
  {name:"MS Germination (sans hormones)",cat:"Plantes",ph:"5.7",comps:[{n:"MS sels demi-force",q:"2.22",u:"g/L",src:"powder"},{n:"Vitamines MS",q:"inclus",u:"",src:"powder"},{n:"Saccharose",q:"10",u:"g/L",src:"powder"},{n:"Agar",q:"8",u:"g/L",src:"powder"}],note:"Milieu MS a demi-force sans hormones de croissance, utilise pour la germination in vitro de graines (apres sterilisation de surface) et l'obtention de plantules axeniques servant de source d'explants steriles. Le saccharose est reduit a 1% car les graines contiennent leurs propres reserves. Les graines sont sterilisees en surface (ethanol 70% 30s puis NaOCl 2-5% 10-20 min, rincages eau sterile) puis deposees sur le milieu. Egalement utilise pour la germination d'embryons immatures (sauvetage d'embryons) apres croisements intergeneriques ou interspecifiques, et pour la germination de graines d'orchidees (protocormes). Conservation des graines en chambre de culture 22-25C, 16h lumiere/8h obscurite."},
];

function MilieuxCalc(p) {
  var dk = p.dark, ae = p.addEntry;
  var [catF, sCatF] = useState("Tous");
  var [selMedia, setSelMedia] = useState(null);
  var [volFinal, sVolFinal] = useState("500");
  var [vfUnit, sVfUnit] = useState("mL");
  var [addAgar, sAddAgar] = useState(false);

  var cats = ["Tous", "Bacteries", "Levures", "Mycologie", "Plantes"];
  var filtered = catF === "Tous" ? MEDIA_DB : MEDIA_DB.filter(function(m) { return m.cat === catF; });

  var VF_mL = (function() {
    var v = parseFloat(volFinal) || 0;
    if (vfUnit === "L") return v * 1000;
    if (vfUnit === "\u00b5L") return v / 1000;
    return v;
  })();

  var scaleFactor = VF_mL / 1000;

  return (
    <div className="space-y-5">
      <Fm t="Preparation de milieux de culture microbiologiques" dark={dk} />

      {!selMedia && (
        <>
          <div className="flex gap-2 flex-wrap">
            {cats.map(function(c) {
              return <button key={c} onClick={function() { sCatF(c); }}
                className={"text-xs px-3 py-1.5 rounded-full font-semibold border transition-colors " + (catF === c
                  ? (dk ? "bg-blue-500/20 text-blue-300 border-blue-500" : "bg-blue-600 text-white border-blue-600")
                  : (dk ? "border-gray-700 text-gray-400 hover:text-gray-200" : "border-gray-200 text-gray-500 hover:text-gray-700"))}>{c}</button>;
            })}
          </div>

          <div className="space-y-2 max-h-[450px] overflow-y-auto pr-1">
            {filtered.map(function(m, i) {
              return (
                <button key={m.name + i} onClick={function() { setSelMedia(m); }}
                  className={"w-full text-left p-3 rounded-xl border transition-all " + (dk ? "border-gray-700 bg-gray-800/40 hover:bg-gray-800 hover:border-gray-600" : "border-gray-200 bg-white hover:bg-blue-50 hover:border-blue-200")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className={"text-sm font-bold " + (dk ? "text-gray-100" : "text-gray-900")}>{m.name}</span>
                    <span className={"text-[10px] px-2 py-0.5 rounded-full font-semibold " + (
                      m.cat === "Bacteries" ? (dk ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-100 text-emerald-700")
                      : m.cat === "Levures" ? (dk ? "bg-amber-900/40 text-amber-400" : "bg-amber-100 text-amber-700")
                      : m.cat === "Plantes" ? (dk ? "bg-green-900/40 text-green-400" : "bg-green-100 text-green-700")
                      : (dk ? "bg-purple-900/40 text-purple-400" : "bg-purple-100 text-purple-700")
                    )}>{m.cat}</span>
                  </div>
                  <div className={"text-[11px] " + (dk ? "text-gray-500" : "text-gray-400")}>{m.comps.length} composants | pH {m.ph}</div>
                  {m.note && <div className={"text-[10px] mt-1 italic " + (dk ? "text-gray-600" : "text-gray-400")}>{m.note}</div>}
                </button>
              );
            })}
          </div>
        </>
      )}

      {selMedia && (
        <>
          <div className="flex items-center gap-2">
            <button onClick={function() { setSelMedia(null); }} className={"p-2 rounded-lg transition-colors " + (dk ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500")}>
              <Svg s={16}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>
            </button>
            <div className="flex-1">
              <div className={"text-base font-bold " + (dk ? "text-gray-100" : "text-gray-900")}>{selMedia.name}</div>
              <div className={"text-[11px] " + (dk ? "text-gray-500" : "text-gray-400")}>{selMedia.cat} | pH {selMedia.ph}</div>
            </div>
          </div>

          {selMedia.note && <div className={"text-xs italic px-3 py-2 rounded-lg " + (dk ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500")}>{selMedia.note}</div>}

          <div className="grid grid-cols-2 gap-4">
            <NumIn label="Volume final" value={volFinal} onChange={sVolFinal} unit={vfUnit} units={VU} onUnitChange={sVfUnit} dark={dk} ph="500" />
            <div className="flex flex-col gap-1.5">
              <label className={"text-[11px] font-semibold tracking-wide uppercase " + (dk ? "text-gray-400" : "text-gray-500")}>Option</label>
              <button onClick={function() { sAddAgar(!addAgar); }}
                className={"px-3 py-2.5 rounded-lg border text-sm font-semibold transition-colors " + (addAgar
                  ? (dk ? "bg-blue-600/20 text-blue-300 border-blue-500" : "bg-blue-50 text-blue-700 border-blue-300")
                  : (dk ? "border-gray-700 text-gray-500" : "border-gray-200 text-gray-400"))}>
                {addAgar ? "Agar: +15 g/L" : "+ Ajouter agar"}
              </button>
            </div>
          </div>

          <div className={"rounded-xl border overflow-hidden " + (dk ? "border-gray-700" : "border-gray-200")}>
            <div className={"grid grid-cols-12 text-[10px] font-semibold uppercase tracking-wider px-3 py-2 " + (dk ? "bg-gray-800 text-gray-500 border-b border-gray-700" : "bg-gray-50 text-gray-400 border-b border-gray-200")}>
              <div className="col-span-5">Composant</div>
              <div className="col-span-3 text-right">Pour 1L</div>
              <div className="col-span-4 text-right">Pour {volFinal} {vfUnit}</div>
            </div>
            {selMedia.comps.map(function(c, i) {
              var q = parseFloat(c.q) || 0;
              var scaled = q * scaleFactor;
              return (
                <div key={i} className={"grid grid-cols-12 items-center px-3 py-2 border-b last:border-0 " + (dk ? "border-gray-800" : "border-gray-100")}>
                  <div className={"col-span-5 text-sm " + (dk ? "text-gray-200" : "text-gray-800")}>{c.n}</div>
                  <div className={"col-span-3 text-right text-sm font-mono " + (dk ? "text-gray-400" : "text-gray-500")}>{c.q} {c.u}</div>
                  <div className={"col-span-4 text-right text-sm font-mono font-bold " + (dk ? "text-emerald-400" : "text-emerald-600")}>{sf(scaled)} {c.u.replace("/L", "")}</div>
                </div>
              );
            })}
            {addAgar && (
              <div className={"grid grid-cols-12 items-center px-3 py-2 border-t " + (dk ? "border-gray-700 bg-gray-800/30" : "border-gray-200 bg-gray-50/50")}>
                <div className={"col-span-5 text-sm font-semibold " + (dk ? "text-amber-400" : "text-amber-700")}>Agar</div>
                <div className={"col-span-3 text-right text-sm font-mono " + (dk ? "text-gray-400" : "text-gray-500")}>15 g/L</div>
                <div className={"col-span-4 text-right text-sm font-mono font-bold " + (dk ? "text-amber-400" : "text-amber-600")}>{sf(15 * scaleFactor)} g</div>
              </div>
            )}
          </div>

          <div className={"p-3 rounded-xl border " + (dk ? "border-gray-700 bg-gray-800/30" : "border-gray-200 bg-gray-50")}>
            <div className={"text-[10px] font-semibold uppercase tracking-wider mb-1 " + (dk ? "text-blue-400" : "text-blue-600")}>Solvant (eau distillee)</div>
            <div className={"text-lg font-mono font-bold " + (dk ? "text-blue-300" : "text-blue-700")}>QSP {volFinal} {vfUnit}</div>
            <div className={"text-[10px] mt-1 " + (dk ? "text-gray-600" : "text-gray-400")}>Dissoudre les poudres, ajuster le pH a {selMedia.ph}, completer au volume final, autoclaver 121C 15min.</div>
          </div>

          <Bt onClick={function() { ae({ module: "Milieux", detail: selMedia.name + " " + volFinal + vfUnit + (addAgar ? " +agar" : "") }); }} dark={dk}>Sauvegarder</Bt>
        </>
      )}
    </div>
  );
}

/* ══════════ HISTORIQUE ══════════ */
function HistP(p){
  var h=p.history,clr=p.clr,dk=p.dark;
  if(!h.length)return <div className={"text-center py-12 text-sm "+(dk?"text-gray-600":"text-gray-400")}>Aucun calcul sauvegarde.</div>;
  return(<div className="space-y-4">
    <div className="flex items-center justify-between"><span className={"text-sm font-semibold "+(dk?"text-gray-300":"text-gray-600")}>{h.length} entree{h.length>1?"s":""}</span><Bt v="danger" onClick={clr} dark={dk}>Effacer tout</Bt></div>
    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">{h.map(function(e,i){return(<div key={i} className={"p-3 rounded-lg border "+(dk?"bg-gray-800/50 border-gray-700":"bg-white border-gray-200")}><div className="flex items-center justify-between mb-1"><span className={"text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border "+(dk?"bg-blue-900/40 text-blue-400 border-blue-800":"bg-blue-50 text-blue-700 border-blue-200")}>{e.module}</span><span className={"text-[10px] "+(dk?"text-gray-600":"text-gray-400")}>{new Date(e.ts).toLocaleString("fr-FR")}</span></div><p className={"text-xs font-mono "+(dk?"text-gray-300":"text-gray-600")}>{e.detail}</p></div>)})}</div>
  </div>)
}

/* ══════════ MAIN APP ══════════ */
var TABS=[
  {id:"mol",lb:"Molarite"},
  {id:"dil",lb:"Dilution"},
  {id:"cent",lb:"Centrifugation"},
  {id:"mm",lb:"Master Mix"},
  {id:"dna",lb:"ADN \u2192 pmol"},
  {id:"buf",lb:"Buffer Prep"},
  {id:"mil",lb:"Milieux"},
  {id:"ref",lb:"Reference"},
  {id:"hist",lb:"Historique"},
];

export default function LabHelper(){
  var[tab,sTab]=useState("mol");
  var[dark,sDark]=useState(false);
  var hs=useHist();
  var db=useDB();

  return(
    <div className={"min-h-screen transition-colors duration-300 "+(dark?"bg-gray-950 text-gray-100":"bg-gray-50 text-gray-900")} style={{fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,500;9..40,700&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet"/>

      <header className={"sticky top-0 z-40 backdrop-blur-xl border-b "+(dark?"bg-gray-950/80 border-gray-800":"bg-white/80 border-gray-200")}>
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={"w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm bg-gradient-to-br "+(dark?"from-blue-600 to-cyan-600":"from-blue-600 to-indigo-700")} style={{fontFamily:"'JetBrains Mono',monospace"}}>Lh</div>
            <div><h1 className="text-base font-bold tracking-tight leading-none">LabHelper <span className={"text-[10px] font-mono "+(dark?"text-gray-600":"text-gray-400")}>v3</span></h1><p className={"text-[10px] tracking-widest uppercase font-semibold "+(dark?"text-gray-600":"text-gray-400")}>Bench Calculator Suite</p></div>
          </div>
          <button onClick={function(){sDark(!dark)}} className={"p-2.5 rounded-xl transition-colors "+(dark?"bg-gray-800 hover:bg-gray-700 text-yellow-400":"bg-gray-100 hover:bg-gray-200 text-gray-600")}>
            {dark?<Svg s={16}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></Svg>:<Svg s={16}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></Svg>}
          </button>
        </div>
      </header>

      <nav className={"sticky top-[53px] z-30 border-b "+(dark?"bg-gray-950 border-gray-800":"bg-white border-gray-200")}>
        <div className="max-w-4xl mx-auto px-3 flex overflow-x-auto gap-1 py-2" style={{scrollbarWidth:"none",WebkitOverflowScrolling:"touch"}}>
          {TABS.map(function(m){
            var active=tab===m.id;
            return(
              <button key={m.id} onClick={function(){sTab(m.id)}}
                className={"px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap shrink-0 "
                  +(active
                    ?(dark?"bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/50":"bg-blue-600 text-white")
                    :(dark?"text-gray-500 hover:text-gray-300 hover:bg-gray-800/60":"text-gray-500 hover:text-gray-700 hover:bg-gray-100"))}>
                {m.lb}
              </button>
            )
          })}
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className={"rounded-2xl border p-5 sm:p-6 shadow-sm "+(dark?"bg-gray-900 border-gray-800 shadow-black/20":"bg-white border-gray-200 shadow-gray-200/50")}>
          <h2 className={"text-lg font-bold mb-5 pb-3 border-b "+(dark?"border-gray-800":"border-gray-100")}>{(TABS.find(function(m){return m.id===tab})||{}).lb||""}</h2>
          {tab==="mol"&&<MolCalc dark={dark} addEntry={hs.add} db={db.all}/>}
          {tab==="dil"&&<DilCalc dark={dark} addEntry={hs.add}/>}
          {tab==="cent"&&<CentCalc dark={dark} addEntry={hs.add}/>}
          {tab==="mm"&&<MMCalc dark={dark} addEntry={hs.add}/>}
          {tab==="dna"&&<DnaCalc dark={dark} addEntry={hs.add}/>}
          {tab==="buf"&&<BufferCalc dark={dark} addEntry={hs.add} db={db.all}/>}
          {tab==="mil"&&<MilieuxCalc dark={dark} addEntry={hs.add}/>}
          {tab==="ref"&&<ChemRef dark={dark} db={db.all} extra={db.extra} saveExtra={db.save}/>}
          {tab==="hist"&&<HistP history={hs.h} clr={hs.clr} dark={dark}/>}
        </div>
        <div className={"text-center text-[10px] uppercase tracking-widest font-semibold mt-6 pb-8 "+(dark?"text-gray-700":"text-gray-300")}>{db.all.length} produits | 7 outils | {MEDIA_DB.length} milieux | Reference CRUD</div>
      </main>
    </div>
  )
}
