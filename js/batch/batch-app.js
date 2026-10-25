/* ==========================================================
   Batch Plan module — page logic.
   Ported from the Batch Plan demo (Batch_Plan_Single_Code (30).html).
   Business rules, calculations and messages are unchanged; only storage
   (IndexedDB -> backend /api/batch) and the user name were adapted.
   ========================================================== */
function batchSignedInUser() { try { return localStorage.getItem('username') || 'User'; } catch (_) { return 'User'; } }
/* ============================================================
   1. EDITABLE SETTINGS
   Keep the database name unchanged to reuse existing saved data.
   Sheet names must match your Excel workbook tabs.
   ============================================================ */
const APP_SETTINGS = {
  companyName: 'Epyllion Fabrics Limited',
  uploadedBy: batchSignedInUser(),
  correctionTimeZone: 'Asia/Dhaka', // Time zone for dated PMC corrections.
  currentUsername: batchSignedInUser(), // Project: the logged-in user.
  databaseName: 'textile_planning_solution',
  databaseVersion: 1,
  generalInfoSheetName: 'General Info',
  knittingPlanSheetName: 'Knitting & Delivery Plan',
  bpDataSheetName: 'BP Data',
  excelReaderSources: [
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
    'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'
  ],
  excelReaderTimeoutMs: 12000
};

/* Short helpers used throughout the application.
   $ finds an HTML element by its id.
   esc makes uploaded text safe to display inside HTML. */
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function currentUsername() { return String(APP_SETTINGS.currentUsername || APP_SETTINGS.uploadedBy || '').trim(); }
$('currentUsername').textContent = currentUsername();
function lastSaveDisplay(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-GB', {
    year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
  });
}

/* ============================================================
   2. EXCEL READER
   ============================================================ */
/* ============================================================
   EXCEL READER - AUTOMATIC ONLINE LOADING
   The application remains one readable HTML file. The spreadsheet
   library loads separately from the URLs in APP_SETTINGS.
   A failed first download automatically tries the second URL.
   ============================================================ */
let excelReaderLoad = null;

function hasExcelReader() {
  return window.XLSX && typeof window.XLSX.read === 'function'
    && window.XLSX.utils && typeof window.XLSX.utils.sheet_to_json === 'function';
}

function loadExcelReaderScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    let finished = false;
    const timeout = setTimeout(() => finish(new Error('Excel reader download timed out.')), APP_SETTINGS.excelReaderTimeoutMs);

    function finish(error) {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      script.onload = null;
      script.onerror = null;
      if (error) { script.remove(); reject(error); }
      else resolve(window.XLSX);
    }

    script.onload = () => finish(hasExcelReader() ? null : new Error('Excel reader could not start.'));
    script.onerror = () => finish(new Error('Excel reader download failed.'));
    document.head.appendChild(script);
  });
}

async function ensureExcelReader() {
  if (hasExcelReader()) return window.XLSX;
  if (!excelReaderLoad) {
    excelReaderLoad = (async () => {
      for (const url of APP_SETTINGS.excelReaderSources) {
        try { return await loadExcelReaderScript(url); }
        catch (_) { if (hasExcelReader()) return window.XLSX; }
      }
      throw new Error('Excel reader could not load. Connect to the internet, then click Upload again. If it still fails, ask IT to allow the reader websites shown in APP_SETTINGS.');
    })();
  }
  try { return await excelReaderLoad; }
  catch (error) { excelReaderLoad = null; throw error; }
}

/* ============================================================
   3. CURRENT FILTERS AND SELECTED BOOKING
   ============================================================ */
// Initial machine settings supplied by the user. Saved edits replace these values.
/* Flat Allowance table transcribed from the supplied image. */
const INITIAL_FLAT_ALLOWANCE = [
 ['All','All','<100','+10 pcs'],
 ['Solid','Collar','100 to 200','8%'],['Solid','Collar','201 to 500','7%'],['Solid','Collar','Above 500','4%'],
 ['Solid','Cuff','100 to 200','8%'],['Solid','Cuff','201 to 500','7%'],['Solid','Cuff','501 to 2000','3%'],['Solid','Cuff','Above 2000','2%'],
 ['Solid','Hem','100 to 200','8%'],['Solid','Hem','201 to 500','7%'],['Solid','Hem','Above 500','4%'],
 ['Solid','Placket','100 to 200','8%'],['Solid','Placket','201 to 500','7%'],['Solid','Placket','501 to 2000','3%'],['Solid','Placket','Above 2000','2%'],
 ['YD','Collar','100 to 200','7%'],['YD','Collar','101 to 200','6%'],['YD','Collar','201 to 500','4%'],['YD','Collar','Above 500','3%'],
 ['YD','Cuff','100 to 200','8%'],['YD','Cuff','101 to 200','6%'],['YD','Cuff','201 to 500','4%'],['YD','Cuff','Above 500','2%'],
 ['YD','Hem','100 to 200','7%'],['YD','Hem','101 to 200','6%'],['YD','Hem','201 to 500','4%'],['YD','Hem','Above 500','3%'],
 ['YD','Placket','100 to 200','8%'],['YD','Placket','101 to 200','6%'],['YD','Placket','201 to 500','4%'],['YD','Placket','Above 500','2%']
].map(([dyeingType,flatType,range,loss],index)=>({id:'allowance_'+(index+1),dyeingType,flatType,range,loss}));
let activeSetupPanel='dyeing';
let flatAllowanceDraft=null;
let flatAllowanceDirty=false;
function getFlatAllowance() { return appState.flatAllowance || INITIAL_FLAT_ALLOWANCE; }
function parseAllowanceRange(value) {
  const text=String(value).trim().replace(/,/g,'').toLowerCase();
  let match;
  if(text==='all')return {min:0,max:Infinity};
  if((match=text.match(/^<\s*(\d+)$/)))return {min:0,max:Number(match[1])-1};
  if((match=text.match(/^<=\s*(\d+)$/)))return {min:0,max:Number(match[1])};
  if((match=text.match(/^(?:above|>)\s*(\d+)$/)))return {min:Number(match[1])+1,max:Infinity};
  if((match=text.match(/^>=\s*(\d+)$/)))return {min:Number(match[1]),max:Infinity};
  if((match=text.match(/^(\d+)\s*(?:to|[-–—])\s*(\d+)$/)) && Number(match[1])<=Number(match[2]))return {min:Number(match[1]),max:Number(match[2])};
  return null;
}
function parseAllowanceLoss(value) {
  const text=String(value).trim();let match;
  if((match=text.match(/^\+?\s*(\d+(?:\.\d+)?)\s*%$/)))return {kind:'percent',value:match[1]};
  if((match=text.match(/^\+?\s*(\d+)\s*(?:pcs|pieces)?$/i)))return {kind:'pieces',value:match[1]};
  return null;
}
function selectAllowanceRule(quantity,dyeingType,kind,rules=getFlatAllowance()) {
  const candidates=rules.flatMap((rule,index)=>{
    const range=parseAllowanceRange(rule.range),loss=parseAllowanceLoss(rule.loss),dye=String(rule.dyeingType).trim().toLowerCase(),flat=String(rule.flatType).trim().toLowerCase();
    if(!range || !loss || ![dyeingType.toLowerCase(),'all'].includes(dye) || ![kind.toLowerCase(),'all'].includes(flat) || quantity<range.min || quantity>range.max)return [];
    return [{rule,loss,range,index,specificity:(dye==='all'?0:1)+(flat==='all'?0:1)}];
  });
  candidates.sort((a,b)=>b.specificity-a.specificity || (a.range.max-a.range.min)-(b.range.max-b.range.min) || a.index-b.index);
  return candidates[0] || null;
}
function allowanceQuantity(quantity,selection) {
  if(!quantity || !selection)return quantity;
  const qty=BigInt(quantity),loss=selection.loss;let result;
  if(loss.kind==='pieces')result=qty+BigInt(loss.value);
  else {
    const [whole,fraction='']=loss.value.split('.'),denominator=10n**BigInt(fraction.length),percent=BigInt(whole+fraction),base=100n*denominator;
    result=(qty*(base+percent)+base-1n)/base;
  }
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Allowance-adjusted quantity exceeds the supported whole-piece range.');
  return Number(result);
}
function reportFlatAllowance(booking,floor) {
  const plan=savedReportPlan(booking,floor);
  return !reviewingLatest(booking.number,floor) && reportBookingStatus(booking,floor)==='Confirm' && plan.flatAllowanceSnapshot ? plan.flatAllowanceSnapshot : getFlatAllowance();
}
function applyComponentAllowance(section,groups,booking,floor) {
  const pools=new Map();section.allowanceBreakdown=[];
  for(const group of groups)for(const [size,qty] of Object.entries(group.quantities)) {
    const key=JSON.stringify([group.colourKey,size]);
    if(!pools.has(key))pools.set(key,{shade:group.shade,size,items:[],quantity:0});
    const pool=pools.get(key);pool.items.push({group,qty});pool.quantity+=qty;
  }
  for(const pool of pools.values()) {
    if(!Number.isSafeInteger(pool.quantity)){pool.items.forEach(item=>item.group.invalid=true);section.warnings.push(pool.shade+': combined size quantity exceeds the supported whole-piece range.');continue;}
    const selection=selectAllowanceRule(pool.quantity,section.dyeingType,section.kind,reportFlatAllowance(booking,floor));
    if(pool.quantity && !selection)section.warnings.push(pool.shade+' · '+pool.size+': no matching Flat Allowance rule; source quantity is unchanged.');
    let adjusted;try{adjusted=allowanceQuantity(pool.quantity,selection);}catch(error){pool.items.forEach(item=>item.group.invalid=true);section.warnings.push(error.message);continue;}
    section.allowanceBreakdown.push({shade:pool.shade,size:pool.size,sourceQty:pool.quantity,processLoss:selection?.rule.loss || '0%',plannedQty:adjusted});
    if(!pool.quantity)continue;
    const allocated=pool.items.map((item,index)=>{const numerator=BigInt(adjusted)*BigInt(item.qty),denominator=BigInt(pool.quantity);return {...item,index,qty:Number(numerator/denominator),remainder:numerator%denominator};});
    let left=adjusted-allocated.reduce((sum,item)=>sum+item.qty,0);
    const ranked=allocated.slice().sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1);
    for(let index=0;index<left;index++)ranked[index].qty++;
    allocated.forEach(item=>item.group.quantities[pool.size]=item.qty);
  }
}
function renderFlatAllowance() {
  if(flatAllowanceDraft===null)flatAllowanceDraft=copyReportData(getFlatAllowance());
  const fields=[['dyeingType','Dyeing Type'],['flatType','Flat Knit Type'],['range','Qty Range (Pcs)'],['loss','Process Loss']];
  $('flatAllowanceRows').innerHTML=flatAllowanceDraft.map((rule,index)=>'<tr>'+fields.map(([key,label])=>`<td><input class="setup-input" data-flat-row="${index}" data-flat-field="${key}" aria-label="${esc(label)} for rule ${index+1}" value="${esc(rule[key])}"></td>`).join('')+'</tr>').join('');
  $('flatAllowanceStatus').textContent=flatAllowanceDraft.length+' rules · '+(flatAllowanceDirty?'Unsaved changes':'Saved');
}
function selectSetupPanel(panel) { activeSetupPanel=panel==='unit'?'unit':panel==='flat'?'flat':'dyeing';switchMainView('setup'); }
function renderSetupPanels() {
  $('unitSetupPanel').classList.toggle('hidden',activeSetupPanel!=='unit');$('navUnitSetup').classList.toggle('active',activeSetupPanel==='unit');
  $('dyeingMCSetupPanel').classList.toggle('hidden',activeSetupPanel!=='dyeing');
  $('flatAllowanceSetupPanel').classList.toggle('hidden',activeSetupPanel!=='flat');
  $('navDyeingMC').classList.toggle('active',activeSetupPanel==='dyeing');$('navFlatAllowance').classList.toggle('active',activeSetupPanel==='flat');
  if(activeSetupPanel==='unit')renderUnitSetup();else if(activeSetupPanel==='flat')renderFlatAllowance();else renderMachineSetup();
}
$('flatAllowanceRows').addEventListener('input',event=>{const input=event.target.closest('[data-flat-field]');if(!input || mutationBusy)return;flatAllowanceDraft[Number(input.dataset.flatRow)][input.dataset.flatField]=input.value;flatAllowanceDirty=true;$('flatAllowanceStatus').textContent=flatAllowanceDraft.length+' rules · Unsaved changes';});
$('btnInsertAllowance').addEventListener('click',()=>{if(!canChangeData())return;if(flatAllowanceDraft===null)flatAllowanceDraft=copyReportData(getFlatAllowance());flatAllowanceDraft.push({id:'allowance_'+Date.now(),dyeingType:'All',flatType:'All',range:'',loss:''});flatAllowanceDirty=true;renderFlatAllowance();});
$('btnSaveAllowance').addEventListener('click',async()=>{
  if(!canChangeData())return;
  const rules=copyReportData(flatAllowanceDraft || getFlatAllowance());
  for(let index=0;index<rules.length;index++) {
    const rule=rules[index];
    if(!['all','solid','yd'].includes(String(rule.dyeingType).trim().toLowerCase()) || !['all','collar','cuff','hem','placket'].includes(String(rule.flatType).trim().toLowerCase()) || !parseAllowanceRange(rule.range) || !parseAllowanceLoss(rule.loss)){toast('Check Flat Allowance row '+(index+1)+': use a valid type, quantity range and percentage or +pcs.');return;}
  }
  setMutationBusy(true);try{await commitChanges({flatAllowance:rules});flatAllowanceDraft=copyReportData(rules);flatAllowanceDirty=false;renderFlatAllowance();toast('Flat Allowance saved.');}catch(error){showSaveError(error);}finally{setMutationBusy(false);}
});
$('navDyeingMC').addEventListener('click',()=>selectSetupPanel('dyeing'));
$('navFlatAllowance').addEventListener('click',()=>selectSetupPanel('flat'));


const INITIAL_MACHINE_SETUP = [
  {
    "id": "machine_1",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "Atmospheric",
    "mcBrand": "Son-Tech",
    "mcNo": "1",
    "capacity": "150",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_2",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "Atmospheric",
    "mcBrand": "Son-Tech",
    "mcNo": "2",
    "capacity": "75",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_3",
    "floor": "EFL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Son-Tech",
    "mcNo": "3",
    "capacity": "30",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_4",
    "floor": "EFL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "4",
    "capacity": "30",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_5",
    "floor": "EFL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "5",
    "capacity": "10",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_6",
    "floor": "EFL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Son-Tech",
    "mcNo": "6",
    "capacity": "10",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_7",
    "floor": "EFL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canler",
    "mcNo": "7",
    "capacity": "50",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_8",
    "floor": "EFL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canler",
    "mcNo": "8",
    "capacity": "50",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_9",
    "floor": "EFL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canler",
    "mcNo": "9",
    "capacity": "50",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_10",
    "floor": "EFL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Yabo",
    "mcNo": "10",
    "capacity": "5",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_11",
    "floor": "EFL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "11",
    "capacity": "30",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_12",
    "floor": "EFL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "12",
    "capacity": "60",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_13",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "13",
    "capacity": "150",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_14",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "14",
    "capacity": "150",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_15",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "15",
    "capacity": "250",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_16",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "16",
    "capacity": "500",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_17",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "17",
    "capacity": "500",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_18",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "Atmospheric",
    "mcBrand": "Fong's",
    "mcNo": "18",
    "capacity": "500",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_19",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "19",
    "capacity": "750",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_20",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "Atmospheric",
    "mcBrand": "Fong's",
    "mcNo": "20",
    "capacity": "750",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_21",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "Atmospheric",
    "mcBrand": "Fong's",
    "mcNo": "21",
    "capacity": "1000",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_22",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies",
    "mcNo": "22",
    "capacity": "1000",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_23",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies",
    "mcNo": "23",
    "capacity": "1000",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_24",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies",
    "mcNo": "24",
    "capacity": "1000",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_25",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies",
    "mcNo": "25",
    "capacity": "750",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_26",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies",
    "mcNo": "26",
    "capacity": "750",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_27",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies",
    "mcNo": "27",
    "capacity": "500",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_28",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies-I-Master",
    "mcNo": "28",
    "capacity": "1500",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_29",
    "floor": "EFL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies-I-Master",
    "mcNo": "29",
    "capacity": "1500",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_30",
    "floor": "EKL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "1",
    "capacity": "10",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_31",
    "floor": "EKL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies",
    "mcNo": "2",
    "capacity": "350",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_32",
    "floor": "EKL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies (New)",
    "mcNo": "3",
    "capacity": "750",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_33",
    "floor": "EKL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "4",
    "capacity": "500",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_34",
    "floor": "EKL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "5",
    "capacity": "500",
    "collarCuff": "NO",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_35",
    "floor": "EKL",
    "mcType": "Bulk",
    "mcGroup": "ATM",
    "mcBrand": "Fong's",
    "mcNo": "6",
    "capacity": "750",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_36",
    "floor": "EKL",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "7",
    "capacity": "250",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_37",
    "floor": "EKL",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's",
    "mcNo": "8",
    "capacity": "30",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_38",
    "floor": "EKL",
    "mcType": "Bulk",
    "mcGroup": "ATM",
    "mcBrand": "Fong's",
    "mcNo": "9",
    "capacity": "1200",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_39",
    "floor": "EKL",
    "mcType": "Bulk",
    "mcGroup": "ATM",
    "mcBrand": "Son-Tech",
    "mcNo": "10",
    "capacity": "75",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_40",
    "floor": "EKL",
    "mcType": "Bulk",
    "mcGroup": "ATM",
    "mcBrand": "Son-Tech",
    "mcNo": "11",
    "capacity": "150",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_41",
    "floor": "EFL-EXT",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies (Z)",
    "mcNo": "1",
    "capacity": "400",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "75%"
  },
  {
    "id": "machine_42",
    "floor": "EFL-EXT",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "MCS",
    "mcNo": "2",
    "capacity": "1000",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_43",
    "floor": "EFL-EXT",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "MCS",
    "mcNo": "3",
    "capacity": "1000",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_44",
    "floor": "EFL-EXT",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Sclavos",
    "mcNo": "4",
    "capacity": "750",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_45",
    "floor": "EFL-EXT",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Sclavos",
    "mcNo": "5",
    "capacity": "250",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_46",
    "floor": "EFL-EXT",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Thies (Old)",
    "mcNo": "6",
    "capacity": "350",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_47",
    "floor": "EFL-EXT",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Sclavos",
    "mcNo": "7",
    "capacity": "500",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_48",
    "floor": "EFL-EXT",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Sclavos",
    "mcNo": "8",
    "capacity": "1000",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_49",
    "floor": "EFL-EXT",
    "mcType": "Bulk",
    "mcGroup": "HT HP",
    "mcBrand": "Sclavos",
    "mcNo": "9",
    "capacity": "1250",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_50",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "1",
    "capacity": "25",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_51",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's (Old)",
    "mcNo": "2",
    "capacity": "10",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_52",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "ATM",
    "mcBrand": "Son-Tech (Old)",
    "mcNo": "3",
    "capacity": "10",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_53",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "4",
    "capacity": "100",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_54",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "5",
    "capacity": "50",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_55",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "6",
    "capacity": "50",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_56",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "7",
    "capacity": "25",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_57",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "8",
    "capacity": "25",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_58",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "9",
    "capacity": "25",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_59",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "10",
    "capacity": "10",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_60",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "11",
    "capacity": "50",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_61",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "12",
    "capacity": "25",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_62",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "13",
    "capacity": "10",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_63",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Canlar",
    "mcNo": "14",
    "capacity": "25",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_64",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's (Old)",
    "mcNo": "15",
    "capacity": "30",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_65",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Fong's (Old)",
    "mcNo": "16",
    "capacity": "30",
    "collarCuff": "YES",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_66",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Suntex (Old)",
    "mcNo": "17",
    "capacity": "15",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_67",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Suntex (Old)",
    "mcNo": "18",
    "capacity": "15",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_68",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Son-Tech (Old)",
    "mcNo": "19",
    "capacity": "30",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_69",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Labpro",
    "mcNo": "20",
    "capacity": "30",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_70",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Labpro",
    "mcNo": "21",
    "capacity": "30",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_71",
    "floor": "EFL-EXT",
    "mcType": "Sample",
    "mcGroup": "HT HP",
    "mcBrand": "Labpro",
    "mcNo": "22",
    "capacity": "20",
    "collarCuff": "No",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": "85%"
  },
  {
    "id": "machine_72",
    "floor": "EFL-EXT",
    "mcType": "Bulk",
    "mcGroup": "Wash",
    "mcBrand": "Pluvia",
    "mcNo": "1",
    "capacity": "5000",
    "collarCuff": "",
    "notPossibleFabric": "",
    "notPossibleGsm": "",
    "loading": ""
  }
];

// App State Variables
let activeStatusTab = 'Pending';
let activeBuyerFilter = 'ALL';
let activeCategory = 'General Information & Planning';
let selectedFile = null;
let currentViewingNumber = null;

/* ============================================================
   4. SAVING AND LOADING DATA WITH INDEXEDDB
   ============================================================ */
// Imported Excel data uses IndexedDB; rendering reads the committed memory cache.
let appDB = null;
let storageReady = false;
let mutationBusy = false;
let appState = { master: [], files: [], datasets: { genInfo: {}, knitPlan: {} }, setup: [], flatAllowance: [], unitSetup: [], cards: [] };
const LEGACY_KEYS = {
  master: 'tps_master_bookings',
  files: 'textile_uploaded_files',
  datasets: 'textile_parsed_datasets',
  setup: 'textile_machine_setup',
  flatAllowance: 'textile_flat_allowance',
  unitSetup:'textile_unit_setup',
  cards: 'textile_batch_cards'
};
function getStoredMasterList() { return appState.master; }
function getStoredFiles() { return appState.files; }
function getStoredDatasets() { return appState.datasets; }

// Project: data comes from the backend (/api/batch/state) instead of IndexedDB.
function readDBState() { return BatchApi.loadState(); }

// Project: saves go to the backend. Only changed bookings, Setup tables and cards are sent;
// the display is updated only after the server accepted the save (same as the demo).
let planVersions = new Map();
let settingVersions = {};
// Unit Setup page (plan section 15.5): buyers and Dropdown Master units sent by GET /api/batch/state.
let unitSetupBuyerNames = [];
let unitSetupUnitOptions = [];
let unitSetupDraft = null;
async function commitChanges(changes) {
  const payload = { plans: [], settings: {}, cards: [] };
  if (changes.master) {
    const previous = new Map(appState.master.map(booking => [booking.number, booking]));
    for (const booking of changes.master) {
      const old = previous.get(booking.number);
      if (old !== booking && JSON.stringify(old) !== JSON.stringify(booking)) {
        payload.plans.push({ orderNo: booking.number, version: planVersions.get(booking.number) || 0, state: booking });
      }
    }
  }
  for (const key of ['setup', 'flatAllowance', 'unitSetup']) {
    if (changes[key]) payload.settings[key] = { value: changes[key], version: settingVersions[key] || 0 };
  }
  if (changes.cards) {
    const previous = new Map((appState.cards || []).map(card => [card.id, JSON.stringify(card)]));
    payload.cards = changes.cards.filter(card => previous.get(card.id) !== JSON.stringify(card));
  }
  if (payload.plans.length || Object.keys(payload.settings).length || payload.cards.length) {
    const result = await BatchApi.commit(payload);
    for (const [number, version] of Object.entries(result.planVersions || {})) planVersions.set(number, version);
    Object.assign(settingVersions, result.settingVersions || {});
  }
  Object.assign(appState, changes);
  BatchApi.notifyCounts();
}
function saveMasterList(master) { return commitChanges({ master }); }
function saveStoredFiles(files) { return commitChanges({ files }); }

function setMutationBusy(busy) {
  mutationBusy = busy;
  const reportLocked=confirmedReportLocked();
  for (const id of ['uploadBtn', 'btnMakeTentative', 'btnMakeConfirm', 'btnMovePending', 'btnSaveSetup', 'btnInsertMachine', 'btnSaveTentative', 'btnInsertAllowance', 'btnSaveAllowance']) {
    $(id).disabled = busy || !storageReady;
  }
  document.querySelectorAll('#machineSetupRows input,#machineSetupRows button').forEach(input => { input.disabled = busy || !storageReady; });
  document.querySelectorAll('[data-load-mc-id]').forEach(button => { button.disabled = busy || !storageReady || button.dataset.mcEligible !== 'true' || reportLocked; });
  document.querySelectorAll('#unitSetupPanel button,#unitSetupRows input,#unitSetupRows select,#flatAllowanceRows input').forEach(input=>{input.disabled=busy || !storageReady;});
  $('machineEvaluationColour').disabled = busy || !storageReady;
  document.querySelectorAll('#tentativeQuestionnaire input,#tentativeQuestionnaire textarea,#btnCancelTentative').forEach(element=>{element.disabled=busy || !storageReady;});
  document.querySelectorAll('#reportContent [data-report-row-action],#reportContent [data-row-field],#reportContent [data-component-dyeing],#reportContent [data-cc-kind],#reportContent [data-cc-all],#reportContent [data-mode-fabric],#reportContent [data-mode-fabric-all]').forEach(element=>{element.disabled=busy || !storageReady || reportLocked;});
  document.querySelectorAll('[data-mode-partial]').forEach(element=>{element.indeterminate=true;});
  for(const id of ['btnMovePending','btnMakeTentative','btnMakeConfirm','btnInternalChange'])$(id).disabled=busy || !storageReady || reportLocked;
  document.querySelectorAll('#reportContent [data-general-action],#reportContent [data-general-field],#reportContent [data-reset-component],#reportContent [data-od-mode]').forEach(button=>{button.disabled=busy || !storageReady || reportLocked;});
  document.querySelectorAll('#reportContent #tallBigEnabled,#reportContent [data-batch-tall-big],#reportContent [data-component-tall-big],#reportContent [data-edit-tall-big]').forEach(control=>{control.disabled=busy || !storageReady || reportLocked;});
  document.querySelectorAll('#reportContent [data-edit-main-tall-big]').forEach(control=>{control.disabled=busy || !storageReady || reportLocked;});
  if(automaticTallBig())document.querySelectorAll('#reportContent [data-batch-tall-big],#reportContent [data-row-field="tallBig"]').forEach(control=>{control.disabled=true;});
  document.querySelectorAll('#tallBigDeclarationDialog button,#tallBigDeclarationDialog select').forEach(control=>{control.disabled=busy || !storageReady;});
  document.querySelectorAll('#tallBigDeclarationDialog [data-declare-size]').forEach(control=>{const context=tallBigDeclarationContext;control.disabled=busy || !storageReady || context?.kind!=='body' && !context?.bodyRows.some(row=>colourSelectionKey(row.shade)===context.colourKey && row.tallBig===context.step);});
  document.querySelectorAll('#reconfirmRevisionDialog button,#internalChangeDialog button,#odDeclarationDialog button,#odBatchCount').forEach(button=>{button.disabled=busy || !storageReady;});
  document.querySelectorAll('[data-card-generate],[data-card-retire]').forEach(button=>{button.disabled=busy || !storageReady || button.dataset.cardBlocked==='true';});
  document.querySelectorAll('[data-delete]').forEach(btn => {
    btn.disabled = busy || !storageReady;
  });
}
function canChangeData() {
  if (!storageReady) { toast('Saved data is not ready. Please wait or reopen this page.'); return false; }
  if (mutationBusy) { toast('Please wait for the current save to finish.'); return false; }
  return true;
}
function showSaveError(err) {
  const quota = err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''));
  toast(quota
    ? 'Browser database storage is full. Free disk space and try again. Previously saved data has been kept.'
    : 'Could not save data: ' + (err.message || String(err)) + '. Previously saved data has been kept.');
}

// Compatibility cleanup removes only the known presets from older versions.
// Imported source records and user-selected booking statuses are preserved.
function legacyDataFingerprint(value) {
  let hash = 2166136261;
  for (const char of JSON.stringify(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
// Project: the demo's browser-only preset cleanup is not needed.
async function removePreviouslySavedDemoData() {}

async function initializeStorage() {
  $('viewBadgeText').textContent = 'Loading saved data…';
  setMutationBusy(true);
  let loadError = null;
  try {
    const saved = await readDBState();
    appState = {
      master: saved.master || [], files: [],
      datasets: { genInfo: saved.datasets?.genInfo || {}, knitPlan: saved.datasets?.knitPlan || {}, bpData: saved.datasets?.bpData || {} },
      setup: saved.setup || [], flatAllowance: saved.flatAllowance || [], unitSetup: saved.unitSetup || [], cards: saved.cards || []
    };
    planVersions = new Map(Object.entries(saved.planVersions || {}));
    settingVersions = { ...(saved.settingVersions || {}) };
    unitSetupBuyerNames = Array.isArray(saved.buyers) ? saved.buyers : [];
    unitSetupUnitOptions = Array.isArray(saved.units) ? saved.units : [];
    unitSetupDraft = null;
    BatchApi.applyPermissions(saved.user);
    // Older confirmations without a snapshot are protected in memory (saved with the next change).
    const protectedMaster = getStoredMasterList().slice();
    if (captureMissingConfirmedSnapshots(protectedMaster)) appState.master = protectedMaster;
    storageReady = true;
    $('viewBadgeText').textContent = 'Ready';
    renderBatchRegister();
    renderFileList();
    setupDraft = null;
    // Project: a reload (for example after a Unit Setup save) must not keep a Flat Allowance draft built from older data.
    flatAllowanceDraft = null;
    flatAllowanceDirty = false;
    renderMachineSetup();
  } catch (err) {
    loadError = err;
    $('viewBadgeText').textContent = 'Storage unavailable';
    toast('Could not open saved data: ' + (err.message || String(err)));
  } finally {
    setMutationBusy(false);
  }
  // Route only after the busy flag is cleared, so report filter dialogs can open.
  if (loadError) BatchApi.failed(loadError); else BatchApi.ready();
}

/* ============================================================
   5. MESSAGES, DATES AND FILE SIZE FORMATTING
   ============================================================ */
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 6500);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatExcelDate(val) {
  if (!val) return '—';
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  }
  return String(val);
}

/* Fabric Info reads these physical Excel columns, regardless of their headers.
   Change only the letters here if your Knitting Plan layout changes. */
const KNITTING_FABRIC_COLUMNS = {
  requiredFinish: 'E',
  construction: 'C', // FabricConstruction choices for Setup's Not Possible Fabric selector.
  peach: 'U',
  brush: 'V',
  heatset: 'W',
  yarn: 'X',
  width: 'Y',
  gaugeDia: 'Z',
  greyWaste: 'AA',
  dryMethod: 'AB',
  floor: 'AC' // Item-wise dyeing floor, used by the five Batch Plan submenus.
};

/* Additional report fields use named Excel headers, in any column position.
   Spaces, punctuation and letter case are ignored. Extend these aliases if needed. */
const KNITTING_INFO_HEADERS = {
  composition: ['Fabric Composition','FabricComposition','Composition','Fab Composition'],
  greigeQty: ['Greige Qty','Greige Quantity','Greige Qty Kgs','Greige Quantity Kg','Greige Quantity Kgs','Greige Qty Kg',
    'Grey Qty','Grey Quantity','Grey Qty Kgs','Grey Quantity Kg','Grey Quantity Kgs','Grey Qty Kg','GreyReq','Grey Req Kgs',
    'GreigeReq','Greige Required Qty','Grey Required Qty','Greige Requirement','Grey Requirement',
    'RequiredQtyKgs','Required Qty Kgs','Required Qty (Kgs)'],
  ld: ['Lapdip Number','Lapdip No','Lap Dip Number','Lap Dip No','Labdip Number','Labdip No',
    'Lab Dip Number','Lab Dip No','LD Number','LD No','LD#'],
  reference: ['Reference','Colour Reference','Color Reference','Ref','Reference No']
};
const knittingInfoHeaderKey = value=>String(value).toLowerCase().replace(/[^a-z0-9]/g,'');
function knittingInfoValue(row,field) {
  const values=new Map();
  for(const [key,value] of Object.entries(row)) {
    if(value===null || value===undefined || String(value).trim()==='')continue;
    const normalized=knittingInfoHeaderKey(key);
    if(!values.has(normalized))values.set(normalized,value);
  }
  for(const header of KNITTING_INFO_HEADERS[field] || []) {
    const key=knittingInfoHeaderKey(header);
    if(values.has(key))return values.get(key);
  }
  return '';
}

function normalizeBookingKey(value) {
  return String(value ?? '').trim().toUpperCase()
    .replace(/^(BDS|PPS)[\s-]*/, '').replace(/^-+(?=\d)/, '');
}

/* Editable floor aliases. Project (plan section 15.4): the server writes each knitting row's floor
   from the Dyeing Plan unit of its colour into _fabricColumns.floor (demo: Knitting column AC).
   Unknown/blank values stay in the parent Batch Plan register until a unit is set. */
const BATCH_FLOORS = [
  { key: 'EFL', label: 'EFL Floor', aliases: ['EFL', 'EFL Floor', 'Epyllion Fabrics Limited'] },
  { key: 'EKL', label: 'EKL Floor', aliases: ['EKL', 'EKL Floor', 'Epyllion Knitex Limited'] },
  { key: 'EXT', label: 'Ext Floor', aliases: ['Ext', 'Ext Floor', 'EFL-Ext', 'EFL Ext', 'Extension', 'Extension Floor'] },
  { key: 'PLUVIA', label: 'Pluvia Wash', aliases: ['Pluvia', 'Pluvia Wash', 'Pluvia Washing'] },
  { key: 'OUTSIDE', label: 'Outside Dyeing', aliases: ['Outside', 'Outside Dyeing', 'Outside Dyeing Floor', 'Out Side', 'Out Side Dyeing', 'Outsource', 'Outsourcing', 'Subcontract', 'Subcontract Dyeing'] }
];
let activeFloor = null; // Parent Batch Plan menu shows all orders.
let currentViewingFloor = null;
let currentReportReviewLatest = false;
const floorValueKey = value => String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const floorAliases = new Map(BATCH_FLOORS.flatMap(floor => floor.aliases.map(alias => [floorValueKey(alias), floor.key])));
function normalizeFloor(value) { return floorAliases.get(floorValueKey(value)) || null; }
function floorLabel(key) { return BATCH_FLOORS.find(floor => floor.key === key)?.label || 'All Floors'; }
function knittingRowFloor(row) { return normalizeFloor(row._fabricColumns?.floor); }

// Rebuild only after a new Knitting Plan dataset is saved. Register pagination,
// counts and report lookups reuse this index even for large uploaded files.
let indexedKnittingPlan = null;
let knittingBookingIndex = new Map();
function ensureKnittingIndex() {
  const plan = getStoredDatasets().knitPlan || {};
  if (indexedKnittingPlan === plan) return;
  indexedKnittingPlan = plan;
  knittingBookingIndex = new Map();
  for (const [number, rows] of Object.entries(plan)) {
    const key = normalizeBookingKey(number);
    if (!knittingBookingIndex.has(key)) knittingBookingIndex.set(key, { rows: [], floors: new Map() });
    const entry = knittingBookingIndex.get(key);
    for (const row of rows) {
      entry.rows.push(row);
      const floor = knittingRowFloor(row);
      if (!floor) continue;
      if (!entry.floors.has(floor)) entry.floors.set(floor, []);
      entry.floors.get(floor).push(row);
    }
  }
}
function getKnittingRows(orderNo, floor = null) {
  ensureKnittingIndex();
  const entry = knittingBookingIndex.get(normalizeBookingKey(orderNo));
  return entry ? (floor ? entry.floors.get(floor) || [] : entry.rows) : [];
}
let indexedSourceMaster=null;
let sourceBookingIndex=new Map();
function sourceBooking(number) {
  const master=getStoredMasterList();
  if(indexedSourceMaster!==master){indexedSourceMaster=master;sourceBookingIndex=new Map(master.map(booking=>[normalizeBookingKey(booking.number),booking]));}
  return sourceBookingIndex.get(normalizeBookingKey(number));
}
function hasOrderOnFloor(number,floor) {
  if(getKnittingRows(number,floor).length)return true;
  const booking=sourceBooking(number);
  const plan=booking?.floorPlans?.[floor];
  return plan?.status==='Confirm' && !!plan.confirmedSnapshot?.sourceRows?.length;
}
function getOrderFloors(number) {
  return BATCH_FLOORS.filter(floor=>hasOrderOnFloor(number,floor.key)).map(floor=>floor.key);
}
function reviewingLatest(number,floor) {
  return currentReportReviewLatest && currentViewingNumber===number && currentViewingFloor===floor;
}
function getReportKnittingRows(number,floor=null) {
  if(confirmedCaptureContext?.booking.number===number && confirmedCaptureContext.floor===floor){const snapshot=savedReportPlan(confirmedCaptureContext.booking,floor).confirmedSnapshot;if(snapshot)return snapshot.sourceRows;}
  if(reviewingLatest(number,floor))return reportDraft?.number===number && reportDraft.floor===floor && reportDraft.reviewLatest ? reportDraft.reviewSourceRows : getKnittingRows(number,floor);
  const booking=sourceBooking(number);
  const plan=booking && savedReportPlan(booking,floor);
  return plan && reportBookingStatus(booking,floor)==='Confirm' && plan.confirmedSnapshot ? plan.confirmedSnapshot.sourceRows : getKnittingRows(number,floor);
}
function treatmentInfo(items) {
  return {
    brush:items.some(item=>/\bbrush(?:ing|ed)?\b/i.test(String(item._fabricColumns?.brush || ''))) ? 'Brush' : '',
    peach:items.some(item=>hasPeachFinish(item._fabricColumns?.peach)) ? 'Peach' : '',
    heatset:items.some(item=>/\bset\b|\bheat\s*set\b|\blycra\s*2\s*[x×]\s*2\s*rib\b/i.test(String(item._fabricColumns?.heatset || ''))) ? 'Heatset' : ''
  };
}
function getFloorBooking(booking, floor = activeFloor) {
  const local=floor ? booking.floorPlans?.[floor] || {} : booking;
  const status=local.status || booking.status || 'Pending';
  const frozen=status==='Confirm' && !reviewingLatest(booking.number,floor) ? local.confirmedSnapshot?.headerData || {} : {};
  if(!floor)return {...booking,...frozen,...generalInfoOverrides(booking,floor),status};
  return {...booking,...frozen,status,
    batchDate:local.batchDate || '',revisedBatch:local.revisedBatch || '',
    tentativeBy:local.tentativeBy || '',confirmedBy:local.confirmedBy || '',lastSaveAt:local.lastSaveAt || '',
    batches:local.batches || [],recipe:local.recipe || [],
    ...treatmentInfo(getReportKnittingRows(booking.number,floor)),...generalInfoOverrides(booking,floor)
  };
}
function getFloorBookings() {
  return getStoredMasterList()
    .filter(booking => !activeFloor || hasOrderOnFloor(booking.number, activeFloor))
    .map(booking => getFloorBooking(booking));
}
function updateFloorMenuCounts() {
  const counts = Object.fromEntries(BATCH_FLOORS.map(floor => [floor.key, 0]));
  for (const booking of getStoredMasterList()) for (const floor of getOrderFloors(booking.number)) counts[floor]++;
  document.querySelectorAll('[data-floor-count]').forEach(span => { span.textContent = counts[span.dataset.floorCount]; });
}
function updateFloorScopeNote() {
  if (activeFloor) {
    $('floorScopeNote').textContent = floorLabel(activeFloor) + ' · Items follow the Dyeing Plan unit of each colour. Confirmed plans retain their saved floor items until explicitly re-confirmed.';
  } else {
    ensureKnittingIndex();
    let unassigned = 0;
    for (const entry of knittingBookingIndex.values()) for (const row of entry.rows) if (!knittingRowFloor(row)) unassigned++;
    $('floorScopeNote').textContent = 'All orders · Choose a floor submenu for its assigned items.' +
      (unassigned ? ` ${unassigned} item(s) have no unit or a unit that is not a Batch floor; set the Unit in Dyeing Plan or the buyer's default in Unit Setup to assign them.` : '');
  }
}
function floorOrderLinks(number, floor = activeFloor, report = false) {
  const floors = getOrderFloors(number);
  if (floors.length < 2) return '';
  // Project: only floors the user may open (Batch Plan menu permission for that floor or all orders).
  const targets = floors.filter(key => key !== floor && (BatchApi.has('menus.batchPlan.all') || BatchApi.has('menus.batchPlan.' + key.toLowerCase())));
  if (!targets.length) return '';
  return `<div class="${report ? 'report-floor-links' : 'order-floor-links'}">${report ? '<span>Same order on:</span>' : ''}${targets.map(key =>
    `<button type="button" class="floor-jump" data-jump-floor="${key}" data-jump-order="${esc(number)}" title="Open order ${esc(number)} · ${esc(floorLabel(key))}">${esc(floorLabel(key))}</button>`
  ).join('')}</div>`;
}
function selectFloor(floor) {
  if (floor && !BATCH_FLOORS.some(item => item.key === floor)) return;
  activeFloor = floor;
  registerPage = 1;
  switchMainView('batch');
  $('registerScrollPane').scrollTop = 0;
}
function handleFloorOrderJump(event) {
  const button = event.target.closest('[data-jump-floor]');
  if (!button) return false;
  const floor = button.dataset.jumpFloor;
  const number = button.dataset.jumpOrder;
  if (!BATCH_FLOORS.some(item => item.key === floor) || !hasOrderOnFloor(number, floor)) return true;
  selectFloor(floor);
  openBatchPlanReport(number);
  BatchApi.syncRoute('plan/' + floor); // Project: highlight the same floor in the project sidebar.
  return true;
}


function readKnittingFabricColumns(sheet, sourceRow) {
  // __rowNum__ is the actual, zero-based Excel row, including skipped blank rows.
  const excelRow = sourceRow.__rowNum__ + 1;
  const values = {};
  for (const [field, column] of Object.entries(KNITTING_FABRIC_COLUMNS)) {
    const cell = sheet[column + excelRow];
    if (!cell || cell.v === undefined || cell.v === null) {
      values[field] = '';
    } else if (field === 'requiredFinish') {
      values[field] = cell.v; // Numeric value, used for quantity totals.
    } else if (field === 'greyWaste') {
      const formatted = String(cell.w ?? cell.v).trim();
      if (formatted.includes('%')) values[field] = formatted;
      else if (typeof cell.v === 'number') {
        // Excel percentages are often stored as fractions: 0.10 means 10%.
        const percent = Math.abs(cell.v) <= 1 ? cell.v * 100 : cell.v;
        values[field] = Number(percent.toFixed(8)) + '%';
      } else values[field] = formatted;
    } else {
      values[field] = String(cell.w ?? cell.v).trim();
    }
  }
  return values;
}

function addDistinctFabricValue(target, value) {
  const text = String(value ?? '').trim();
  if (!text) return;
  const key = text.toLowerCase().replace(/\s+/g, ' ');
  if (!target.has(key)) target.set(key, text);
}

function fabricQuantity(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function hasPeachFinish(value) {
  const text=String(value ?? '').trim();
  return /\bpeach(?:ing|ed)?\b/i.test(text) && !/\b(?:no|non|not)\s*[-:]?\s*peach(?:ing|ed)?\b/i.test(text);
}
function extractDeduplicatedFabrics(orderNo, booking, floor = activeFloor) {
  const groups = new Map();
  for (const row of getReportKnittingRows(orderNo, floor)) {
    const construction = String(row.FabricConstruction || row.Fabric || '').trim();
    const gsm = String(row.FinishGSM || row.GSM || '').trim();
    if (!construction) continue;
    const fabricKey = construction.toLowerCase().replace(/\s+/g, ' ');
    const gsmKey = /^\d+(\.\d+)?$/.test(gsm) ? String(Number(gsm)) : gsm.toLowerCase();
    const key = fabricKey + '|' + gsmKey;
    if (!groups.has(key)) {
      groups.set(key, {
        type: construction, gsm, totalQty: 0, requiredFinish: 0,
        hasRequiredFinish: false, otherRequiredValues: new Map(),
        gaugeDia: new Map(), width: new Map(), yarn: new Map(),
        composition: new Map(), ld: new Map(), reference: new Map(),
        greigeQty: 0, hasGreigeQty: false, otherGreigeValues: new Map(),
        greyWaste: new Map(), dryMethod: new Map(), remarks: new Set()
      });
    }
    const group = groups.get(key);
    // Rows from older uploads need to be uploaded again to capture Excel letters.
    const columns = row._fabricColumns || {};
    const required = fabricQuantity(columns.requiredFinish);
    if (required !== null) {
      group.requiredFinish += required;
      group.hasRequiredFinish = true;
    } else addDistinctFabricValue(group.otherRequiredValues, columns.requiredFinish);
    group.totalQty += fabricQuantity(row.RequiredQtyKgs ?? row.GreyReq) ?? required ?? 0;
    for(const field of ['composition','ld','reference'])addDistinctFabricValue(group[field],knittingInfoValue(row,field));
    const greigeValue=knittingInfoValue(row,'greigeQty'),greigeQuantity=fabricQuantity(greigeValue);
    if(greigeQuantity!==null){group.greigeQty=productionSum([group.greigeQty,greigeQuantity]);group.hasGreigeQty=true;}
    else addDistinctFabricValue(group.otherGreigeValues,greigeValue);
    for (const field of ['gaugeDia', 'width', 'yarn', 'greyWaste', 'dryMethod']) {
      addDistinctFabricValue(group[field], columns[field]);
    }
    if (hasPeachFinish(columns.peach)) group.remarks.add('Peach');
    if (/\bbrush(?:ing|ed)?\b/i.test(String(columns.brush || ''))) group.remarks.add('Brush');
    if (/\bset\b|\bheat\s*set\b|\blycra\s*2\s*[x×]\s*2\s*rib\b/i.test(String(columns.heatset || ''))) {
      group.remarks.add('Heatset');
    }
  }
  const list = Array.from(groups.values());
  // Fabric numbers follow Required (Finish), largest to smallest.
  list.sort((a, b) => (b.hasRequiredFinish ? b.requiredFinish : -Infinity) -
    (a.hasRequiredFinish ? a.requiredFinish : -Infinity));
  const fabrics=list.map((group, index) => {
    const requiredValues = [];
    if (group.hasRequiredFinish) requiredValues.push(String(Number(group.requiredFinish.toFixed(8))));
    requiredValues.push(...group.otherRequiredValues.values());
    const greigeValues=[];
    if(group.hasGreigeQty)greigeValues.push(String(group.greigeQty));
    greigeValues.push(...group.otherGreigeValues.values());
    return {
      name: 'Fabric ' + (index + 1), key: rowFabricKey({Fabric: group.type, GSM: group.gsm}), type: group.type, gsm: group.gsm,
      requiredFinish: requiredValues.join(', '),
      gaugeDia: Array.from(group.gaugeDia.values()).join(', '),
      width: Array.from(group.width.values()).join(', '),
      yarn: Array.from(group.yarn.values()).join(', '),
      composition: Array.from(group.composition.values()).join(', '),
      greigeQty: greigeValues.join(', '),
      ld: Array.from(group.ld.values()).join(', '),
      reference: Array.from(group.reference.values()).join(', '),
      greyWaste: Array.from(group.greyWaste.values()).join(', '),
      dryMethod: Array.from(group.dryMethod.values()).join(', '),
      remarks: ['Peach', 'Brush', 'Heatset'].filter(value => group.remarks.has(value)).join(', ')
    };
  });
  return [...fabrics,...componentFabricRows(booking || sourceBooking(orderNo) || {number:orderNo},floor)].map((fabric,index)=>({...fabric,name:'Fabric '+(index+1)}));
}


/* ============================================================
   7. BOOKING REGISTER AND SEARCH FILTERS
   ============================================================ */
/* Machine setup has its own saved record so imports cannot overwrite it.
   Input values remain editable drafts until Save Changes succeeds. */
const MACHINE_SETUP_FIELDS = [
  ['floor', 'Dyeing Floor'], ['mcType', 'MC Type'], ['mcGroup', 'M/C Group'],
  ['mcBrand', 'MC Brand'], ['mcNo', 'MC No.'], ['capacity', 'Capacity'],
  ['collarCuff', 'Collar Cuff'], ['notPossibleFabric', 'Not Possible Fabric'],
  ['loading', 'Loading']
];
let setupDraft = null;
let setupDirty = false;

function getMachineSetup() { return appState.setup || []; }
function updateSetupSaveStatus() {
  $('setupSaveStatus').textContent = setupDirty ? 'Unsaved changes' : 'Saved';
  $('setupSaveStatus').style.color = setupDirty ? '#b45309' : '#047857';
}

function renderMachineSetup() {
  if (setupDraft === null) setupDraft = getMachineSetup().map(row => ({ ...row }));
  $('machineSetupRows').innerHTML = setupDraft.map((row, index) => `<tr>
    ${MACHINE_SETUP_FIELDS.map(([field, label]) => field === 'notPossibleFabric' ? `<td>${fabricPickerButton(row, index)}</td>` : `<td>
      <input type="text" class="setup-input" data-setup-row="${index}" data-setup-field="${field}"
        value="${esc(row[field] ?? '')}" aria-label="${esc(label)} for row ${index + 1}"
        ${mutationBusy || !storageReady ? 'disabled' : ''}>
    </td>`).join('')}
  </tr>`).join('');
  $('setupRowCount').textContent = setupDraft.length + ' machines';
  updateSetupSaveStatus();
}

$('machineSetupRows').addEventListener('input', event => {
  const input = event.target.closest('[data-setup-field]');
  if (!input || !storageReady || mutationBusy) return;
  const rowIndex = Number(input.dataset.setupRow);
  const field = input.dataset.setupField;
  if (!setupDraft[rowIndex] || !MACHINE_SETUP_FIELDS.some(([key]) => key === field)) return;
  setupDraft[rowIndex][field] = input.value;
  setupDirty = true;
  updateSetupSaveStatus();
});

$('btnInsertMachine').addEventListener('click', () => {
  if (!canChangeData()) return;
  if (setupDraft === null) setupDraft = getMachineSetup().map(row => ({ ...row }));
  const row = { id: 'machine_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) };
  for (const [field] of MACHINE_SETUP_FIELDS) row[field] = '';
  setupDraft.push(row);
  setupDirty = true;
  renderMachineSetup();
  const newRow = $('machineSetupRows').lastElementChild;
  if (typeof newRow.scrollIntoView === 'function') newRow.scrollIntoView({ block: 'nearest' });
  const firstInput = newRow.querySelector('input');
  if (typeof firstInput.focus === 'function') firstInput.focus();
});

async function saveMachineSetup() {
  if (!canChangeData()) return;
  if (!setupDirty) { toast('No setup changes to save.'); return; }
  const setup = setupDraft.map(row => ({ ...row }));
  setMutationBusy(true);
  $('setupSaveStatus').textContent = 'Saving…';
  try {
    await commitChanges({ setup });
    setupDirty = false;
    updateSetupSaveStatus();
    toast('Machine setup saved successfully.');
  } catch (error) {
    showSaveError(error);
    updateSetupSaveStatus();
  } finally {
    setMutationBusy(false);
  }
}
$('btnSaveSetup').addEventListener('click', saveMachineSetup);

/* Not Possible Fabric is a per-machine list of excluded constructions.
   New uploads capture physical column C; older rows can use their named header. */
function constructionKey(value) { return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }
let constructionChoiceSource = null;
let constructionBpSource = null;
let constructionChoiceCache = [];
function getFabricConstructionChoices() {
  const plan = getStoredDatasets().knitPlan;
  const bp=getStoredDatasets().bpData;
  if (plan === constructionChoiceSource && bp===constructionBpSource) return constructionChoiceCache;
  constructionChoiceSource = plan;
  constructionBpSource=bp;
  const choices = new Map();
  for (const rows of Object.values(plan || {})) {
    for (const row of rows) {
      const value = String(row._fabricColumns?.construction ?? row.FabricConstruction ?? '').trim();
      if (value && !choices.has(constructionKey(value))) choices.set(constructionKey(value), value);
    }
  }
  for(const rows of Object.values(bp || {}))for(const row of rows)if(componentKinds(bpValue(row,'details')).length){const value=String(bpValue(row,'fabricType')).trim();if(value && !choices.has(constructionKey(value)))choices.set(constructionKey(value),value);}
  constructionChoiceCache = Array.from(choices.values()).sort((a, b) => a.localeCompare(b, undefined, {numeric:true}));
  return constructionChoiceCache;
}
function machineExcludedFabrics(machine) {
  if (Array.isArray(machine.notPossibleFabric)) return machine.notPossibleFabric.filter(value => String(value).trim());
  const value = String(machine.notPossibleFabric ?? '').trim();
  if (!value) return [];
  // Preserve an old single fabric name containing commas if it is in the upload.
  if (getFabricConstructionChoices().some(name => constructionKey(name) === constructionKey(value))) return [value];
  return value.split(/[;,\n]+/).map(name => name.trim()).filter(Boolean);
}
/* A checked fabric is excluded completely. An unchecked fabric's GSM limit
   excludes only that construction above its own threshold. Blank adds no limit. */
function machineFabricRestrictions(machine) {
  const rules=new Map(),legacyLimits=[];
  const textLimit=value=>String(value ?? '').trim().replace(/^>\s*/,'');
  const getRule=fabric=>{
    const name=String(fabric ?? '').trim(),key=constructionKey(name);
    if(!name)return null;
    if(!rules.has(key))rules.set(key,{fabric:name,blocked:false,gsmGreaterThan:''});
    return rules.get(key);
  };
  const mergeLimit=(rule,value)=>{
    const text=textLimit(value);if(!text)return;
    const number=fabricQuantity(text),previous=fabricQuantity(rule.gsmGreaterThan);
    if(!rule.gsmGreaterThan || number===null || number<0 || previous!==null && number<previous)rule.gsmGreaterThan=text;
  };
  for(const fabric of machineExcludedFabrics(machine))getRule(fabric).blocked=true;
  for(const source of Array.isArray(machine.notPossibleFabricRules)?machine.notPossibleFabricRules:[]){
    const rule=getRule(source?.fabric);
    if(rule){rule.blocked=rule.blocked || (typeof source.blocked==='boolean'?source.blocked:true);mergeLimit(rule,source.gsmGreaterThan);}
    else if(textLimit(source?.gsmGreaterThan))legacyLimits.push(source.gsmGreaterThan);
  }
  if(textLimit(machine.notPossibleGsm))legacyLimits.push(machine.notPossibleGsm);
  // Old machine-wide values had no fabric association. Preserve them as visible
  // independent rules for the current catalog, saved without an unscoped source.
  if(legacyLimits.length){
    const fabrics=new Set([...getFabricConstructionChoices(),...Array.from(rules.values()).map(rule=>rule.fabric)]);
    for(const fabric of fabrics)for(const value of legacyLimits)mergeLimit(getRule(fabric),value);
  }
  return Array.from(rules.values());
}
function fabricRestrictionText(rule) {
  if(rule.blocked)return rule.fabric+' · blocked'+(rule.gsmGreaterThan?' (GSM > '+rule.gsmGreaterThan+' saved)':'');
  return rule.fabric+' · GSM > '+rule.gsmGreaterThan;
}
function fabricPickerButton(row,index) {
  const rules=machineFabricRestrictions(row).filter(rule=>rule.blocked || rule.gsmGreaterThan),text=rules.map(fabricRestrictionText).join('; ');
  return `<button type="button" class="setup-input fabric-picker-button" data-fabric-picker="${index}"
    aria-label="Not Possible Fabric for row ${index+1}" title="${esc(text || 'Select excluded fabrics and per-fabric GSM limits')}"
    ${mutationBusy || !storageReady ? 'disabled' : ''}>${esc(text || 'Select fabrics / GSM…')} <span>▾</span></button>`;
}
let fabricPickerState=null;
function openFabricPicker(rowIndex) {
  if(!canChangeData() || !setupDraft?.[rowIndex])return;
  const machine=setupDraft[rowIndex],rules=machineFabricRestrictions(machine);
  const selected=new Map(rules.filter(rule=>rule.blocked).map(rule=>[constructionKey(rule.fabric),rule.fabric]));
  const limits=new Map(rules.map(rule=>[constructionKey(rule.fabric),rule.gsmGreaterThan]));
  const choices=new Map(getFabricConstructionChoices().map(value=>[constructionKey(value),value]));
  for(const rule of rules)if(!choices.has(constructionKey(rule.fabric)))choices.set(constructionKey(rule.fabric),rule.fabric);
  fabricPickerState={rowIndex,machineId:machine.id,selected,limits,choices:Array.from(choices.values()).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))};
  $('fabricPickerTitle').textContent='Not Possible Fabric · '+(machine.mcBrand || 'Machine')+'-'+(machine.mcNo || rowIndex+1);
  $('fabricPickerSearch').value='';$('fabricPickerError').textContent='';
  const legacy=String(machine.notPossibleGsm ?? '').trim() || (machine.notPossibleFabricRules || []).some(rule=>!rule.fabric && String(rule.gsmGreaterThan ?? '').trim());
  $('fabricPickerMigration').textContent=legacy?'The previous shared GSM limit is shown on each existing fabric row. You can change or clear each fabric’s limit independently.':'';
  $('fabricPickerMigration').classList.toggle('hidden',!legacy);
  $('fabricPickerDialog').classList.remove('hidden');
  renderFabricPickerChoices();$('fabricPickerSearch').focus();
}
function visibleFabricPickerChoices() {
  const search=constructionKey($('fabricPickerSearch').value);
  return (fabricPickerState?.choices || []).filter(value=>constructionKey(value).includes(search));
}
function updateFabricPickerCount() {
  if(!fabricPickerState)return;
  const visible=visibleFabricPickerChoices(),checked=visible.filter(value=>fabricPickerState.selected.has(constructionKey(value))).length;
  $('fabricPickerSelectAll').checked=!!visible.length && checked===visible.length;
  $('fabricPickerSelectAll').indeterminate=checked>0 && checked<visible.length;
  $('fabricPickerSelectAll').disabled=!visible.length;
  const limits=Array.from(fabricPickerState.limits.values()).filter(value=>String(value).trim()).length;
  $('fabricPickerCount').textContent=fabricPickerState.selected.size+' fabrics blocked · '+limits+' GSM limits';
}
function renderFabricPickerChoices() {
  if(!fabricPickerState)return;
  const visible=visibleFabricPickerChoices();
  $('fabricPickerChoices').innerHTML=visible.length?visible.map(value=>{
    const key=constructionKey(value);
    return `<div class="fabric-rule-choice"><label class="fabric-choice"><input type="checkbox" data-fabric-choice="${esc(value)}" ${fabricPickerState.selected.has(key)?'checked':''}>${esc(value)}</label><input type="text" inputmode="decimal" class="setup-input fabric-gsm-limit" data-fabric-gsm="${esc(value)}" value="${esc(fabricPickerState.limits.get(key) || '')}" placeholder="No GSM limit" aria-label="Not Possible GSM (Greater than) for ${esc(value)}"></div>`;
  }).join(''):'<div class="fabric-picker-empty">No matching fabrics. Upload the Knitting Plan to load column C.</div>';
  updateFabricPickerCount();
}
function closeFabricPicker() {
  const rowIndex=fabricPickerState?.rowIndex;fabricPickerState=null;
  $('fabricPickerDialog').classList.add('hidden');
  const opener=document.querySelector(`[data-fabric-picker="${rowIndex}"]`);if(opener)opener.focus();
}
function applyFabricPicker() {
  if(!fabricPickerState || !canChangeData())return;
  const {rowIndex,machineId,selected,limits,choices}=fabricPickerState;
  if(setupDraft[rowIndex]?.id!==machineId){closeFabricPicker();return;}
  const rules=choices.map(fabric=>({fabric,blocked:selected.has(constructionKey(fabric)),gsmGreaterThan:String(limits.get(constructionKey(fabric)) || '').trim().replace(/^>\s*/,'')})).filter(rule=>rule.blocked || rule.gsmGreaterThan);
  const invalid=rules.find(rule=>rule.gsmGreaterThan && (fabricQuantity(rule.gsmGreaterThan)===null || fabricQuantity(rule.gsmGreaterThan)<0));
  if(invalid){$('fabricPickerError').textContent='Enter a valid non-negative GSM limit for '+invalid.fabric+', or leave it blank for no GSM restriction.';return;}
  const row={...setupDraft[rowIndex],notPossibleFabricRules:rules,notPossibleFabric:rules.filter(rule=>rule.blocked).map(rule=>rule.fabric),notPossibleGsm:''};
  // An old unscoped value cannot be mapped before any fabric catalog exists.
  // Retain its source until an upload supplies fabric names for this picker.
  if(!choices.length)row.notPossibleGsm=setupDraft[rowIndex].notPossibleGsm || '';
  setupDraft[rowIndex]=row;
  setupDirty=true;renderMachineSetup();closeFabricPicker();
}
$('machineSetupRows').addEventListener('click',event=>{
  const button=event.target.closest('[data-fabric-picker]');if(button)openFabricPicker(Number(button.dataset.fabricPicker));
});
$('fabricPickerSearch').addEventListener('input',renderFabricPickerChoices);
$('fabricPickerChoices').addEventListener('change',event=>{
  if(!fabricPickerState)return;
  const input=event.target.closest('[data-fabric-choice]');if(!input)return;
  const value=input.dataset.fabricChoice,key=constructionKey(value);
  if(input.checked)fabricPickerState.selected.set(key,value);else fabricPickerState.selected.delete(key);
  $('fabricPickerError').textContent='';updateFabricPickerCount();
});
$('fabricPickerChoices').addEventListener('input',event=>{
  const input=event.target.closest('[data-fabric-gsm]');if(!input || !fabricPickerState)return;
  fabricPickerState.limits.set(constructionKey(input.dataset.fabricGsm),input.value);$('fabricPickerError').textContent='';updateFabricPickerCount();
});
$('fabricPickerSelectAll').addEventListener('change',event=>{
  if(!fabricPickerState)return;
  for(const value of visibleFabricPickerChoices()){
    const key=constructionKey(value);if(event.target.checked)fabricPickerState.selected.set(key,value);else fabricPickerState.selected.delete(key);
  }
  renderFabricPickerChoices();
});
$('btnFabricPickerOK').addEventListener('click',applyFabricPicker);
$('btnFabricPickerCancel').addEventListener('click',closeFabricPicker);
$('fabricPickerDialog').addEventListener('click',event=>{if(event.target===$('fabricPickerDialog'))closeFabricPicker();});
$('fabricPickerDialog').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeFabricPicker();}
  if(event.key==='Tab'){
    const controls=Array.from($('fabricPickerDialog').querySelectorAll('button,input')).filter(element=>!element.disabled),first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }
});
function machineAllowsFabrics(machine,fabrics) {
  const rules=new Map(machineFabricRestrictions(machine).map(rule=>[constructionKey(rule.fabric),rule]));
  return fabrics.every(fabric=>{
    const rule=rules.get(constructionKey(fabric.type));
    if(!rule)return true;
    if(rule.blocked)return false;
    if(!rule.gsmGreaterThan)return true;
    const limit=fabricQuantity(rule.gsmGreaterThan),gsm=fabricQuantity(fabric.gsm);
    return limit!==null && limit>=0 && gsm!==null && gsm<=limit;
  });
}


// Pagination operates on the filtered register, before rendering table rows.
let registerPageSize = '10';
let registerPage = 1;
let registerTotalPages = 1;
let registerFilterSignature = '';

function paginateRegister(list, filters) {
  const signature = JSON.stringify(filters);
  if (signature !== registerFilterSignature) {
    registerPage = 1;
    registerFilterSignature = signature;
  }
  const size = registerPageSize === 'All' ? Math.max(1, list.length) : Number(registerPageSize);
  registerTotalPages = Math.max(1, Math.ceil(list.length / size));
  registerPage = Math.max(1, Math.min(registerPage, registerTotalPages));
  const start = (registerPage - 1) * size;
  const end = Math.min(start + size, list.length);
  $('registerResultCount').textContent = list.length
    ? `Showing ${start + 1}–${end} of ${list.length} orders` : 'Showing 0 orders';
  $('registerPageInfo').textContent = `Page ${registerPage} of ${registerTotalPages}`;
  $('btnPreviousPage').disabled = registerPage === 1;
  $('btnNextPage').disabled = registerPage === registerTotalPages;
  return registerPageSize === 'All' ? list : list.slice(start, end);
}

$('registerPageSize').addEventListener('change', event => {
  const value = event.target.value;
  if (!['10', '20', '50', '100', 'All'].includes(value)) return;
  registerPageSize = value;
  registerPage = 1;
  renderBatchRegister();
});
$('btnPreviousPage').addEventListener('click', () => {
  if (registerPage > 1) { registerPage--; renderBatchRegister(); }
});
$('btnNextPage').addEventListener('click', () => {
  if (registerPage < registerTotalPages) { registerPage++; renderBatchRegister(); }
});


function updateStatusCounts() {
  updateFloorMenuCounts();
  const master = getFloorBookings();
  const pendingCount = master.filter(b => (b.status || 'Pending') === 'Pending').length;
  const confirmCount = master.filter(b => b.status === 'Confirm').length;
  const tentativeCount = master.filter(b => b.status === 'Tentative').length;

  $('countPending').textContent = pendingCount;
  $('countConfirm').textContent = confirmCount;
  $('countTentative').textContent = tentativeCount;
  $('countNeedReconfirm').textContent = getReconfirmBookings().length;
}

function renderBatchRegister() {
  updateStatusCounts();
  const master = getFloorBookings();
  updateFloorScopeNote();
  const showReconfirm = activeStatusTab==='NeedReconfirm';
  const showSaveAudit = showReconfirm || ['Tentative','Confirm'].includes(activeStatusTab);
  $('registerSavedByHeading').textContent=activeStatusTab==='Tentative' ? 'Tentative By' : 'Confirmed By';
  document.querySelectorAll('.reconfirm-list-column').forEach(element=>element.classList.toggle('hidden',!showReconfirm));
  $('registerColumns').innerHTML = '<col class="col-manage"><col class="col-order"><col class="col-date"><col class="col-buyer">' +
    (showSaveAudit ? '<col class="col-saved-by"><col class="col-last-save">' : '') +
    (showReconfirm ? '<col class="col-revision"><col class="col-revision">' : '');
  document.querySelectorAll('.saved-list-column').forEach(element=>element.classList.toggle('hidden', !showSaveAudit));
  document.querySelector('.register-table').classList.toggle('has-save-audit', showSaveAudit);
  document.querySelector('.register-table').classList.toggle('has-reconfirmation', showReconfirm);
  
  // Filter by Active Tab (Pending, Confirm, Tentative)
  let list = showReconfirm ? getReconfirmBookings() : master.filter(b => (b.status || 'Pending') === activeStatusTab);

  // Filter by Buyer Carousel
  if (activeBuyerFilter !== 'ALL') {
    list = list.filter(b => (b.buyer || '').trim().toUpperCase() === activeBuyerFilter);
  }

  // Top Global Search
  const globalQ = $('globalSearchInput').value.trim().toLowerCase();
  if (globalQ) {
    list = list.filter(b => (b.number || '').toLowerCase().includes(globalQ) || (b.buyer || '').toLowerCase().includes(globalQ));
  }

  // Column specific filters
  const fOrder = $('colSearchOrder').value.trim().toLowerCase();
  const fDate = $('colSearchDate').value.trim().toLowerCase();
  const fBuyer = $('colSearchBuyer').value.trim().toLowerCase();

  if (fOrder) list = list.filter(b => (b.number || '').toLowerCase().includes(fOrder));
  if (fDate) list = list.filter(b => (b.date || '').toLowerCase().includes(fDate));
  if (fBuyer) list = list.filter(b => (b.buyer || '').toLowerCase().includes(fBuyer));

  const pageRows = paginateRegister(list, [activeFloor, activeStatusTab, activeBuyerFilter, globalQ, fOrder, fDate, fBuyer]);
  const tbody = $('batchRegisterRows');
  if (list.length === 0) {
    tbody.innerHTML = '';
    $('tableEmptyState').classList.remove('hidden');
    return;
  }

  $('tableEmptyState').classList.add('hidden');
  tbody.innerHTML = pageRows.map(b => `
    <tr>
      <td style="text-align:center">
        <button class="btn-view-eye" data-booking="${esc(b.number)}" ${showReconfirm ? `data-booking-floor="${esc(b._registerFloor || 'ALL')}"` : ''} title="View Batch Plan for Order ${esc(b.number)}">
          <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </td>
      <td>
        <span class="order-link">${esc(b.number)}</span>
        ${showReconfirm && !activeFloor && b._registerFloor ? `<div class="register-floor-name">${esc(floorLabel(b._registerFloor))}</div>` : ''}
        ${floorOrderLinks(b.number)}
      </td>
      <td>${esc(b.date || '—')}</td>
      <td><strong>${esc(b.buyer || '—')}</strong></td>
      ${showSaveAudit ? `<td>${esc((activeStatusTab==='Tentative' ? b.tentativeBy : b.confirmedBy) || '—')}</td><td class="last-save-cell" title="${esc(b.lastSaveAt || '')}">${esc(lastSaveDisplay(b.lastSaveAt))}</td>` : ''}
      ${showReconfirm ? `<td>${esc(revisionDisplay(latestRevisionNo(b.number,b._registerFloor)))}</td><td>${esc(revisionDisplay(savedReportPlan(b,b._registerFloor).confirmedSnapshot?.revisionNo))}</td>` : ''}
    </tr>
  `).join('');
}

/* ============================================================
   8. BUILD THE BATCH PLAN REPORT
   ============================================================ */
function infoRow(pairs) {
  return '<tr>' + pairs.map(([l, v]) => `<th>${esc(l)}</th><td>${v ? esc(v) : '<span class="placeholder-cell">—</span>'}</td>`).join('') + '</tr>';
}

function table(headers, rows, cls = 'grid-table') {
  return `<div class="table-wrap"><table class="${cls}"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

/* Factory headings are selected from the active Batch Plan floor submenu.
   Floors without a custom heading keep the original company name. */
const FLOOR_FACTORY_NAMES = {
  EFL: 'Epyllion Fabrics Limited',
  EKL: 'Epyllion Knitex Limited',
  PLUVIA: 'Epyllion Knitex Limited-Pluvia'
};
function reportFactoryName(floor) { return FLOOR_FACTORY_NAMES[floor] || APP_SETTINGS.companyName; }
// Named revision headers work in any Excel column. Missing values remain unknown.
function revisionNumberFromRows(rows) {
  let revision=null;
  for(const row of rows)for(const [key,value] of Object.entries(row)) {
    if(key.replace(/[^a-z0-9]/gi,'').toLowerCase()!=='ybrevisedno')continue;
    const text=String(value ?? '').trim();
    if(!/^\d+(?:\.0+)?$/.test(text))continue;
    const number=Number(text);
    if(Number.isSafeInteger(number) && number>=0)revision=Math.max(revision ?? 0,number);
  }
  return revision;
}
function revisionLabel(revision) {
  if(revision===null || revision===undefined)return '';
  if(!revision)return 'Main Batch Plan';
  const lastTwo=revision % 100,suffix=lastTwo>=11 && lastTwo<=13 ? 'th' : ({1:'st',2:'nd',3:'rd'}[revision % 10] || 'th');
  return revision+suffix+' Revised Batch Plan';
}
function batchPlanRevision(number,floor) {
  const booking=sourceBooking(number);
  return booking && savedReportPlan(booking,floor).confirmedSnapshot?confirmedRevisionLabel(booking,floor):revisionLabel(revisionNumberFromRows(getReportKnittingRows(number,floor)));
}
// A confirmed BP revision belongs to the plan, independently of source YB revisions.
function confirmedBatchRevision(booking,floor) {
  const snapshot=savedReportPlan(booking,floor).confirmedSnapshot;
  return snapshot && Object.prototype.hasOwnProperty.call(snapshot,'revisionNo')?snapshot.revisionNo:revisionNumberFromRows(getReportKnittingRows(booking.number,floor));
}
function pmcCorrectionDate(value) {
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  const timeZone=APP_SETTINGS.correctionTimeZone || 'Asia/Dhaka';
  const time=date.toLocaleTimeString('en-US',{timeZone,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});
  const day=date.toLocaleDateString('en-GB',{timeZone,day:'2-digit',month:'short',year:'numeric'});
  return time+', '+day;
}
function confirmedRevisionLabel(booking,floor) {
  const plan=savedReportPlan(booking,floor),label=revisionLabel(confirmedBatchRevision(booking,floor)),date=plan.pmcCorrectionAt && pmcCorrectionDate(plan.pmcCorrectionAt);
  return label+(date?' (Correction from PMC, Correction date: '+date+' )':'');
}
const confirmedReportLockCache=new WeakMap();
function confirmedReportLocked(booking=currentReportBooking(),floor=currentViewingFloor) {
  if(!booking || reviewingLatest(booking.number,floor))return false;
  const source=sourceBooking(booking.number) || booking,datasets=getStoredDatasets();
  let cached=confirmedReportLockCache.get(source);
  if(!cached || cached.datasets!==datasets){cached={datasets,floors:new Map()};confirmedReportLockCache.set(source,cached);}
  if(!cached.floors.has(floor))cached.floors.set(floor,needsReconfirmation(source,floor));
  return cached.floors.get(floor);
}
function canEditReport() {
  if(!canChangeData())return false;
  if(confirmedReportLocked()){toast('This confirmed plan is read-only. Open it from Need Re-Confirm List to review and save the latest data.');return false;}
  return true;
}
// Confirmed edits are local drafts until the user approves Internal change.
let internalChangeContext=null;
function isConfirmedInternalDraft() {
  const booking=currentReportBooking();
  return !!booking && !!reportDraft && !reportDraft.reviewLatest && reportBookingStatus(booking,currentViewingFloor)==='Confirm';
}
function reportSaveHint() {
  return isConfirmedInternalDraft()?'Click Internal change to approve.':reportDraft?.reviewLatest?'Re-confirm the latest plan to retain it.':'Save as Tentative or Confirmed to retain it.';
}
function openInternalChangeDialog() {
  if(!isConfirmedInternalDraft() || !canEditReport())return false;
  if(reportRowEditor){toast('Save Row or Cancel the row being edited first.');return false;}
  if(!reportDraft.dirty){toast('No internal changes are pending.');return false;}
  closeMachineEvaluation();closeTentativeQuestionnaire(false);closeReconfirmRevisionDialog(false);
  internalChangeContext={number:currentViewingNumber,floor:currentViewingFloor,draft:reportDraft,plan:savedReportPlan(currentReportBooking(),currentViewingFloor)};
  $('internalChangeContext').textContent='Order / Booking No: '+currentViewingNumber+(currentViewingFloor?' · '+floorLabel(currentViewingFloor):'');
  $('internalChangeError').textContent='';
  $('internalChangeDialog').classList.remove('hidden');$('internalChangeDialog').setAttribute('aria-hidden','false');
  $('btnInternalChangeYes').focus();return true;
}
function closeInternalChangeDialog(restoreFocus=true) {
  const context=internalChangeContext;internalChangeContext=null;
  $('internalChangeDialog').classList.add('hidden');$('internalChangeDialog').setAttribute('aria-hidden','true');
  if(restoreFocus && context)$('btnInternalChange').focus();
}
function internalChangeContextMatches(context) {
  return !!context && context.number===currentViewingNumber && context.floor===currentViewingFloor && context.floor===activeFloor && context.draft===reportDraft && isConfirmedInternalDraft() && savedReportPlan(currentReportBooking(),context.floor)===context.plan;
}
async function submitInternalChange(approve) {
  const context=internalChangeContext;
  if(typeof approve!=='boolean' || !canChangeData())return false;
  if(!internalChangeContextMatches(context)){closeInternalChangeDialog(false);toast('The booking changed. Reopen it to review internal changes.');return false;}
  if(!approve){activeStatusTab='Confirm';backToList();toast('Internal changes discarded. The confirmed plan is unchanged.');return true;}
  if(!canEditReport()){closeInternalChangeDialog(false);refreshEditableReport();return false;}
  if(reportRowEditor){$('internalChangeError').textContent='Save Row or Cancel the edited row first.';return false;}
  const generalError=confirmGeneralInfoError(currentReportBooking(),context.floor);if(generalError){$('internalChangeError').textContent=generalError;return false;}
  const tallBigError=tallBigSaveError(currentReportBooking(),context.floor);if(tallBigError){$('internalChangeError').textContent=tallBigError;return false;}
  const master=getStoredMasterList().slice(),index=master.findIndex(booking=>booking.number===context.number);
  if(index<0)return false;
  setMutationBusy(true);
  try {
    if(!reportDraft.previewReport)reportDraft.previewReport=captureConfirmedReport(master[index],context.floor);
    writeDraftToBooking(master,index,'Confirm',{internalApproval:true});
    await saveMasterList(master);
    if(internalChangeContext===context){discardReportDraft();openBatchPlanReport(context.number,{reviewLatest:false});}
    renderBatchRegister();toast('Internal changes approved and saved. The batch plan revision is unchanged.');return true;
  }catch(error){showSaveError(error);if(internalChangeContext===context)$('internalChangeError').textContent='Could not save. The confirmed plan is unchanged and your draft is available for retry.';return false;}
  finally{setMutationBusy(false);}
}
$('btnInternalChange').addEventListener('click',openInternalChangeDialog);
$('btnInternalChangeYes').addEventListener('click',()=>submitInternalChange(true));
$('btnInternalChangeNo').addEventListener('click',()=>submitInternalChange(false));
$('internalChangeDialog').addEventListener('click',event=>{if(event.target===$('internalChangeDialog') && !mutationBusy)closeInternalChangeDialog();});
$('internalChangeDialog').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();if(!mutationBusy)closeInternalChangeDialog();}
  if(event.key==='Tab'){const controls=Array.from($('internalChangeDialog').querySelectorAll('button')).filter(button=>!button.disabled),first=controls[0],last=controls[controls.length-1];if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}
});

let reconfirmRevisionContext=null;
function openReconfirmRevisionDialog() {
  if(!reportDraft?.reviewLatest || !canEditReport())return false;
  if(reportRowEditor){toast('Save or cancel the row being edited before re-confirming.');return false;}
  const booking=currentReportBooking(),plan=booking && savedReportPlan(booking,currentViewingFloor);
  if(!plan?.confirmedSnapshot){toast('This booking has no confirmed plan to re-confirm.');return false;}
  const revision=confirmedBatchRevision(booking,currentViewingFloor);
  if(revision!==null && (!Number.isSafeInteger(revision) || revision<0 || revision===Number.MAX_SAFE_INTEGER)){toast('The saved batch plan revision cannot be incremented.');return false;}
  closeMachineEvaluation();closeTentativeQuestionnaire(false);
  reconfirmRevisionContext={number:booking.number,floor:currentViewingFloor,draft:reportDraft,plan,revision};
  $('reconfirmRevisionContext').textContent='Order / Booking No: '+booking.number+(currentViewingFloor?' · '+floorLabel(currentViewingFloor):'');
  $('reconfirmRevisionCurrent').textContent='Current: '+(revisionLabel(revision) || 'Revision not provided');
  $('reconfirmRevisionYesPreview').textContent='After saving: '+revisionLabel((revision ?? 0)+1);
  $('reconfirmRevisionNoPreview').textContent='Keep previous plan: '+(revisionLabel(revision) || 'Revision not provided');
  $('reconfirmRevisionError').textContent='';
  $('reconfirmRevisionDialog').classList.remove('hidden');$('reconfirmRevisionDialog').setAttribute('aria-hidden','false');
  $('btnReconfirmYes').focus();return true;
}
function closeReconfirmRevisionDialog(restoreFocus=true) {
  const open=reconfirmRevisionContext;reconfirmRevisionContext=null;
  $('reconfirmRevisionDialog').classList.add('hidden');$('reconfirmRevisionDialog').setAttribute('aria-hidden','true');
  if(restoreFocus && open)$('btnMakeConfirm').focus();
}
function reconfirmContextMatches(context) {
  return !!context && context.number===currentViewingNumber && context.floor===currentViewingFloor && context.floor===activeFloor && context.draft===reportDraft && reportDraft?.reviewLatest && savedReportPlan(currentReportBooking(),context.floor)===context.plan;
}
async function submitReconfirmRevisionChoice(increaseRevision) {
  const context=reconfirmRevisionContext;
  if(typeof increaseRevision!=='boolean' || !canChangeData())return false;
  if(!reconfirmContextMatches(context)){closeReconfirmRevisionDialog(false);toast('The booking changed. Reopen the latest plan review.');return false;}
  const saved=await updateBookingStatus('Confirm',null,increaseRevision);
  if(!saved && reconfirmRevisionContext===context)$('reconfirmRevisionError').textContent='The plan was not saved. Your review and selected data are still available. Please try again.';
  return saved;
}
$('btnReconfirmYes').addEventListener('click',()=>submitReconfirmRevisionChoice(true));
$('btnReconfirmNo').addEventListener('click',()=>submitReconfirmRevisionChoice(false));
$('btnCancelReconfirm').addEventListener('click',()=>{if(!mutationBusy)closeReconfirmRevisionDialog();});
$('reconfirmRevisionDialog').addEventListener('click',event=>{if(event.target===$('reconfirmRevisionDialog') && !mutationBusy)closeReconfirmRevisionDialog();});
$('reconfirmRevisionDialog').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();if(!mutationBusy)closeReconfirmRevisionDialog();}
  if(event.key==='Tab'){const controls=Array.from($('reconfirmRevisionDialog').querySelectorAll('button')).filter(button=>!button.disabled),first=controls[0],last=controls[controls.length-1];if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}
});

function latestRevisionNo(number,floor) {
  const rows=getKnittingRows(number,floor);
  return revisionNumberFromRows(rows.length ? rows : getKnittingRows(number));
}
function revisionDisplay(revision) { return revision===null || revision===undefined ? '—' : String(revision); }
// Compare content independently of Excel row/column order, including duplicate items.
function knittingSourceFingerprint(rows) {
  const canonical=value=>{
    if(Array.isArray(value))return value.map(canonical);
    if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==null && value[key]!==undefined && String(value[key]).trim()!=='').map(key=>[key,canonical(value[key])]));
    return String(value ?? '').trim();
  };
  return JSON.stringify(rows.map(row=>JSON.stringify(canonical(row))).sort());
}
let comparedKnittingDataset=null;
let latestSourceFingerprints=new Map();
// Production is live progress, not a change to the approved planning content.
function knittingProductionValue(row) {
  const entry=Object.entries(row).find(([header])=>knittingInfoHeaderKey(header)==='knitprod');
  return entry?.[1] ?? '';
}
function knittingPlanFingerprint(rows) {
  return knittingSourceFingerprint(rows.map(row=>Object.fromEntries(Object.entries(row).filter(([header])=>knittingInfoHeaderKey(header)!=='knitprod'))));
}
function showKnittingReadiness() {
  const booking=currentReportBooking();
  return !!booking && !rebuildingConfirmedReport && !reviewingLatest(booking.number,currentViewingFloor) && reportBookingStatus(booking,currentViewingFloor)==='Confirm';
}
function knittingResourceKey(shade,type,gsm) {
  return JSON.stringify([colourSelectionKey(shade),rowFabricKey({FabricConstruction:type,GSM:gsm})]);
}
function knittingQuantityAtLeast(available,required) {
  const a=productionFraction(available),b=productionFraction(required);
  return a.n*b.d>=b.n*a.d;
}
function evaluateKnittingReadiness(booking,floor,fabrics,rows,components=[]) {
  const production=new Map();
  for(const source of getKnittingRows(booking.number,floor)) {
    const shade=firstUploadedValue(source,BATCH_CALCULATION.colorHeaders),type=source.FabricConstruction || source.Fabric || '',gsm=String(source.GSM ?? '').trim()?source.GSM:source.FinishGSM || '';
    if(!String(type).trim() || !String(shade).trim())continue;
    const key=knittingResourceKey(shade,type,gsm),raw=knittingProductionValue(source),value=fabricQuantity(raw);
    if(!production.has(key))production.set(key,{quantity:0,known:false,missing:false});
    const entry=production.get(key);
    if(value===null || value<0){entry.missing=true;continue;}
    entry.quantity=productionSum([entry.quantity,value]);entry.known=true;
  }
  const remaining=new Map(Array.from(production,([key,entry])=>[key,entry.quantity]));
  const ccBatches=new Set();
  for(const section of components)for(const row of section.rows)if(Object.values(row.quantities || {}).some(quantity=>quantity>0)){
    for(const id of [row.id,row.bodyBatchId])if(id)ccBatches.add(JSON.stringify([String(id),colourSelectionKey(row.shade)]));
  }
  return rows.map(row=>{
    const cells={},knownKeys=new Set(fabrics.map(fabric=>fabric.key));let hasRequired=false,short=false,unknown=false;
    let hasCC=ccBatches.has(JSON.stringify([String(row.id),colourSelectionKey(row.shade)]));
    for(const fabric of fabrics) {
      if(fabric.componentKind){cells[fabric.key]={kind:'cc',label:'Check CC Prod.'};continue;}
      const quantity=fabricQuantity(row.quantities?.[fabric.key]) || 0;if(quantity<=0)continue;
      hasRequired=true;
      const key=knittingResourceKey(row.shade,fabric.type,fabric.gsm),entry=production.get(key),available=remaining.get(key) || 0;
      const ready=!!entry?.known && knittingQuantityAtLeast(available,quantity);
      const missing=!entry?.known;
      cells[fabric.key]={kind:ready?'ready':missing?'unknown':'short',label:ready?'Knit ok':missing?'Knit prod. missing':'Not knit ok',availableKg:available,requiredKg:quantity,producedKg:entry?.quantity || 0};
      if(!ready){short=true;if(missing)unknown=true;}
      // Earlier listed batches reserve production per fabric, including partial
      // amounts. A later batch cannot reuse production reserved for an earlier one.
      remaining.set(key,productionSum([available,-Math.min(available,quantity)]));
    }
    for(const [key,value] of Object.entries(row.quantities || {}))if(!knownKeys.has(key) && (fabricQuantity(value) || 0)>0){hasRequired=true;short=true;unknown=true;}
    if(Object.values(row.componentKg || {}).some(quantity=>quantity===null || quantity>0))hasCC=true;
    const kind=short?(unknown?'unknown':'short'):hasRequired || hasCC?'ready':'empty';
    const label=short?(unknown?'Knit prod. missing':'Not knit ok'):hasCC?'Knit ok but need check CC Prod.':hasRequired?'Knit ok':'No fabric qty';
    return {kind,label,cells,hasCC};
  });
}
function knittingBadge(state,summary=false) {
  if(!state)return '';
  const detail=state.requiredKg===undefined?'':`Produced: ${kgText(state.producedKg)} kg; available before this batch: ${kgText(state.availableKg)} kg; required: ${kgText(state.requiredKg)} kg.`;
  return `<span class="knit-status ${summary?'knit-status-summary ':''}knit-${state.kind}"${detail?` title="${esc(detail)}"`:''}>${esc(state.label)}</span>`;
}

function latestSourceFingerprint(number,floor) {
  const dataset=getStoredDatasets().knitPlan;
  if(comparedKnittingDataset!==dataset){comparedKnittingDataset=dataset;latestSourceFingerprints=new Map();}
  const key=JSON.stringify([normalizeBookingKey(number),floor]);
  if(!latestSourceFingerprints.has(key))latestSourceFingerprints.set(key,knittingPlanFingerprint(getKnittingRows(number,floor)));
  return latestSourceFingerprints.get(key);
}
const CONFIRMED_HEADER_FIELDS=['displayNumber','displayConfirmedBy','number','buyer','team','date','eventDay','style','pmc','merchant','unit','brush','peach','heatset','knitStart','knitEnd','dyeStart','dyeEnd','deliveryStart','deliveryEnd','knittingPlan','dyeingPlan','deliveryPlan','lastRevised','batchDate','revisedBatch','instructions','fabric','batches','recipe'];
// Confirmed output is immutable until an explicit PMC save or Yes re-confirm.
// Source snapshots alone are insufficient: later rules or Setup edits must not
// recalculate previously approved quantities, component weights or machines.
let confirmedCaptureContext=null;
let rebuildingConfirmedReport=false;
function frozenConfirmedReport(booking,floor) {
  if(!booking || rebuildingConfirmedReport || reviewingLatest(booking.number,floor) || reportBookingStatus(booking,floor)!=='Confirm')return null;
  if(reportDraft?.number===booking.number && reportDraft.floor===floor && reportDraft.dirty && reportDraft.previewReport && !confirmedReportLocked(booking,floor))return reportDraft.previewReport;
  return savedReportPlan(booking,floor).confirmedSnapshot?.reportData || null;
}
function captureConfirmedReport(booking,floor,{useDraft=true}={}) {
  const saved={number:currentViewingNumber,floor:currentViewingFloor,review:currentReportReviewLatest,draft:reportDraft,editor:reportRowEditor,fabrics:currentFabricRows,batches:currentBatchRows,evaluations:currentReportMachineEvaluations,truncated:currentReportBatchRowsTruncated,components:currentComponentSections,capture:confirmedCaptureContext,rebuilding:rebuildingConfirmedReport};
  try {
    const activeDraft=useDraft && reportDraft?.number===booking.number && reportDraft.floor===floor?reportDraft:null;
    currentViewingNumber=booking.number;currentViewingFloor=floor;currentReportReviewLatest=!!activeDraft?.reviewLatest;
    // Read saved manual data for migrations; active corrections keep their draft.
    if(!activeDraft){reportDraft=null;reportDraft={number:booking.number,floor,reviewLatest:false,manual:copyReportData(reportManualState(booking,floor)),dirty:false};}
    confirmedCaptureContext={booking,floor,preserveSavedValues:!useDraft};rebuildingConfirmedReport=true;reportRowEditor=null;
    const view=getFloorBooking(booking,floor),tables=buildEditableReportTables(view,floor),components=buildComponentBatches(view,floor,tables.rows),instructions=instructionRows(view,floor);
    const savedRows=!useDraft && savedReportPlan(booking,floor).reportOverrides?.batchRows;
    if(Array.isArray(savedRows)){const computed=new Map(tables.rows.map(row=>[row.rowKey || row.id,row]));tables.rows=savedRows.map(row=>({...copyReportData(computed.get(row.rowKey || row.id) || {}),...copyReportData(row)}));}
    return copyReportData({schemaVersion:1,fabrics:tables.fabrics,rows:tables.rows,warnings:tables.warnings,evaluations:currentReportMachineEvaluations,components,instructions,truncated:currentReportBatchRowsTruncated});
  } finally {
    currentViewingNumber=saved.number;currentViewingFloor=saved.floor;currentReportReviewLatest=saved.review;reportDraft=saved.draft;reportRowEditor=saved.editor;currentFabricRows=saved.fabrics;currentBatchRows=saved.batches;currentReportMachineEvaluations=saved.evaluations;currentReportBatchRowsTruncated=saved.truncated;currentComponentSections=saved.components;confirmedCaptureContext=saved.capture;rebuildingConfirmedReport=saved.rebuilding;
  }
}
function confirmedBpSnapshotRows(snapshot) {
  const rows=snapshot.bpSourceRows || [];
  if(snapshot.schemaVersion>=2)return rows;
  // Older confirmations pre-date per-piece weights. Recover their weight only
  // from their own frozen RequiredQtyKgs/RequiredQtyPCs, never a revised upload.
  return rows.map(row=>{
    if(String(bpValue(row,'weight')).trim()!=='')return row;
    const pcs=fabricQuantity(bpValue(row,'quantity')),kg=fabricQuantity(bpValue(row,'quantityKg'));
    return pcs>0 && kg!==null && kg>=0?{...row,'Weight /Pcs':kg/pcs}:row;
  });
}

function makeConfirmedSnapshot(booking,floor,rows=getKnittingRows(booking.number,floor)) {
  const plan=savedReportPlan(booking,floor);
  const header={...booking,...(floor ? {batchDate:plan.batchDate || '',revisedBatch:plan.revisedBatch || '',batches:plan.batches || [],recipe:plan.recipe || [],...treatmentInfo(rows)} : {})};
  Object.assign(header,generalInfoOverrides(booking,floor));
  if(reportDraft?.number===booking.number && reportDraft.floor===floor)header.unit=unitForBuyer(header.buyer) || header.unit || '';
  const bpRows=reportDraft?.number===booking.number && reportDraft.floor===floor && reportDraft.reviewLatest ? reportDraft.reviewBpRows : getBpRows(booking.number,floor,rows,(plan.reportOverrides?.batchRows || []).map(row=>row.shade));
  return {schemaVersion:2,sourceRows:copyReportData(rows),sourceFingerprint:knittingPlanFingerprint(rows),revisionNo:revisionNumberFromRows(rows),
    bpSourceRows:copyReportData(bpRows),bpSourceFingerprint:knittingSourceFingerprint(bpRows),
    headerData:copyReportData(Object.fromEntries(CONFIRMED_HEADER_FIELDS.filter(key=>header[key]!==undefined).map(key=>[key,header[key]])))};
}
// Protect older saved confirmations before the next import replaces live source data.
function captureMissingConfirmedSnapshots(master) {
  let changed=false;
  for(let index=0;index<master.length;index++) {
    let booking=master[index];
    for(const floor of [null,...BATCH_FLOORS.map(value=>value.key)]) {
      const old=savedReportPlan(booking,floor);
      if(reportBookingStatus(booking,floor)!=='Confirm' || (floor && !old.status && !getKnittingRows(booking.number,floor).length))continue;
      const needsBp=old.confirmedSnapshot && old.confirmedSnapshot.bpSourceRows===undefined;
      if(old.confirmedSnapshot?.reportData && old.confirmedBy!==undefined && !needsBp && old.flatAllowanceSnapshot!==undefined)continue;
      const plan={...old,status:'Confirm',flatAllowanceSnapshot:old.flatAllowanceSnapshot || copyReportData(getFlatAllowance()),confirmedBy:old.confirmedBy || old.tentativeBy || (!old.status ? booking.confirmedBy || booking.tentativeBy : '') || '',
        confirmedSnapshot:old.confirmedSnapshot?{...old.confirmedSnapshot,...(needsBp?{bpSourceRows:[],bpSourceFingerprint:knittingSourceFingerprint([])}:{})}:makeConfirmedSnapshot(booking,floor)};
      booking=floor?{...booking,floorPlans:{...(booking.floorPlans || {}),[floor]:plan}}:{...booking,...plan};
      if(!plan.confirmedSnapshot.reportData)plan.confirmedSnapshot={...plan.confirmedSnapshot,reportData:captureConfirmedReport(booking,floor,{useDraft:false})};
      // The root spread above holds the earlier snapshot reference; publish the
      // finished snapshot after capture for both root and floor confirmations.
      booking=floor?{...booking,floorPlans:{...(booking.floorPlans || {}),[floor]:plan}}:{...booking,...plan};
      changed=true;
    }
    master[index]=booking;
  }
  return changed;
}
function needsReconfirmation(booking,floor) {
  const plan=savedReportPlan(booking,floor),snapshot=plan.confirmedSnapshot;
  return reportBookingStatus(booking,floor)==='Confirm' && !!snapshot && (knittingPlanFingerprint(snapshot.sourceRows)!==latestSourceFingerprint(booking.number,floor) ||
    (snapshot.bpSourceRows!==undefined && snapshot.bpSourceFingerprint!==knittingSourceFingerprint(getBpRows(booking.number,floor))));
}
function getReconfirmBookings() {
  if(activeFloor)return getFloorBookings().filter(booking=>needsReconfirmation(booking,activeFloor)).map(booking=>({...booking,_registerFloor:activeFloor}));
  const rows=[];
  for(const booking of getStoredMasterList()) {
    if(needsReconfirmation(booking,null))rows.push({...getFloorBooking(booking,null),_registerFloor:null});
    // A whole-order confirmation already represents all its floors in this list.
    else for(const floor of BATCH_FLOORS.map(value=>value.key))if(needsReconfirmation(booking,floor))rows.push({...getFloorBooking(booking,floor),_registerFloor:floor});
  }
  return rows;
}

/* Editable batch calculation settings.
   Batches use the existing colour quantity field; E / Required (Finish) is
   the fallback when no colour quantity field exists in an uploaded row. */
const BATCH_CALCULATION = {
  semiBleachLoading: 0.90,
  defaultMaximumLoadingPercent: 80, // Configurable fallback; saved machine Setup loading takes precedence.
  kgPerNozzle: 250,
  maxRenderedBatches: 10000, // Display limit only; never changes machine ranking.
  colorHeaders: ['Color', 'Colour', 'Shade', 'Color Name', 'Colour Name'],
  quantityHeaders: ['RequiredQtyKgs', 'GreyReq', 'Required Qty Kgs', 'Required Qty (Kgs)', 'Grey Req'],
  ldHeaders: ['LD#', 'LD #', 'LD No', 'LD No.', 'LD Number', 'Lab Dip No'],
  referenceHeaders: ['Reference', 'Colour Reference', 'Color Reference', 'Ref']
};
function firstUploadedValue(row, headers) {
  for (const header of headers) {
    const value = row[header];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return '';
}
function rowFabricKey(row) {
  const fabric = String(row.FabricConstruction || row.Fabric || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const gsm = String(row.FinishGSM || row.GSM || '').trim();
  const gsmKey = /^\d+(\.\d+)?$/.test(gsm) ? String(Number(gsm)) : gsm.toLowerCase();
  return fabric + '|' + gsmKey;
}
function loadingFraction(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number(text.replace(/%$/, '').trim());
  const fraction = text.includes('%') || number > 1 ? number / 100 : number;
  return Number.isFinite(fraction) && fraction > 0 && fraction <= 1 ? fraction : null;
}
function kgText(quantityKg) { return quantityKg===null?'Weight missing':Number.isFinite(quantityKg)?String(Number(quantityKg.toFixed(3))):''; }

// Nozzle counts follow rated capacity: 500 kg => 2, 1000 kg => 4.
function machineNozzles(capacity) { return Math.max(1, Math.ceil(capacity / BATCH_CALCULATION.kgPerNozzle)); }
function isSemiBleach(shade) { return /\bsemi[\s-]*bleach(?:ed)?\b/i.test(shade) || /^rfd$/i.test(String(shade ?? '').trim()); }

/* Generic ERP Machine Selection — reusable in browsers and Node.js.
   Browser: GenericMachineSelection.selectMachine({...})
   Node: const { selectMachine } = require('./Generic_Machine_Selection.js');

   Example:
   selectMachine({ totalQuantityKg: 1251, machines: [250, 500, 750, 1000, 1500],
                   maximumLoadingPercent: 80 });
   => capacityKg 1000, batches 2, batchQuantityKg 625.5, loading 62.55%.

   No dependency on ERP, fabric, floor, shade, brand or machine number.
   Ceiling, loading eligibility and ranking use exact decimal fractions derived
   from the numeric inputs. Returned numeric fields are unrounded Number
   representations; formatting is separate. Never pass display-rounded inputs.
*/
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GenericMachineSelection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DEFAULT_MAXIMUM_LOADING_PERCENT = 80;

  class MachineSelectionError extends Error {
    constructor(message, evaluations) {
      super(message);
      this.name = 'MachineSelectionError';
      this.code = 'NO_ELIGIBLE_MACHINE';
      this.evaluations = evaluations;
    }
  }
  // BigInt fractions prevent decimal boundary errors (e.g. 0.56 / 0.7 at 80%).
  // These private values never enter JSON output or display formatting.
  const exactLoading = new WeakMap();
  function decimalFraction(value) {
    const [coefficient, exponentText = '0'] = String(value).toLowerCase().split('e');
    const [whole, fraction = ''] = coefficient.split('.');
    const power = Number(exponentText) - fraction.length;
    const digits = BigInt(whole + fraction);
    return power >= 0 ? {n:digits * 10n ** BigInt(power), d:1n} : {n:digits, d:10n ** BigInt(-power)};
  }
  function fractionNumber(n, d) {
    let a = n, b = d;
    while (b) { const remainder = a % b; a = b; b = remainder; }
    n /= a; d /= a;
    const numerator = Number(n), denominator = Number(d);
    if (Number.isFinite(numerator) && Number.isFinite(denominator)) return numerator / denominator;
    // Preserve Number's range when the fraction's integer components are huge.
    const numeratorText = n.toString(), denominatorText = d.toString();
    const top = Number(numeratorText.slice(0, 16)) / 10 ** (Math.min(16, numeratorText.length) - 1);
    const bottom = Number(denominatorText.slice(0, 16)) / 10 ** (Math.min(16, denominatorText.length) - 1);
    return Number(String(top / bottom) + 'e' + (numeratorText.length - denominatorText.length));
  }
  function validPercentage(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100;
  }
  // Optional constraints may return true, false, or a human-readable reason.
  // They must be synchronous. Throwing from a constraint propagates to its caller.
  function constraintReasons(result, fallback) {
    if (result === true) return [];
    if (result === false) return [fallback];
    if (typeof result === 'string' && result.trim()) return [result.trim()];
    throw new TypeError('A machine constraint must return true, false, or a non-empty rejection reason.');
  }
  function compareLoading(a, b) {
    const left = exactLoading.get(a), right = exactLoading.get(b);
    if (left && right) {
      const difference = right.n * left.d - left.n * right.d;
      return difference === 0n ? 0 : difference > 0n ? 1 : -1;
    }
    return b.actualLoadingPercent - a.actualLoadingPercent;
  }
  function compareConfigurations(a, b) {
    return a.batches - b.batches || compareLoading(a, b) ||
      a.capacityKg - b.capacityKg || a.inputIndex - b.inputIndex;
  }

  /**
   * @param {Object} inputs
   * @param {number} inputs.totalQuantityKg Positive, finite production quantity.
   * @param {Array<number|Object>} inputs.machines Capacities or machine objects.
   *   Object: { id?, capacityKg, available?, eligible?, rejectionReasons?,
   *             maximumLoadingPercent? }
   *   Per-machine percentage is an optional override for ERP setup limits.
   * @param {number} [inputs.maximumLoadingPercent=80] Configurable default limit.
   * @param {Function} [inputs.availability] (machine, inputs) => true/false/reason.
   * @param {Function} [inputs.productionEligibility] Same contract as availability.
   * @returns {{selected:Object,evaluations:Array<Object>,ranking:Array<Object>}}
   * @throws {MachineSelectionError} If none eligible; .evaluations retains all rows.
   * @throws {TypeError} For invalid top-level inputs or constraint contracts.
   */
  function selectMachine(inputs) {
    if (!inputs || typeof inputs !== 'object') throw new TypeError('Machine selection inputs are required.');
    const {totalQuantityKg, machines, availability, productionEligibility} = inputs;
    const maximumLoadingPercent = inputs.maximumLoadingPercent === undefined
      ? DEFAULT_MAXIMUM_LOADING_PERCENT : inputs.maximumLoadingPercent;
    if (typeof totalQuantityKg !== 'number' || !Number.isFinite(totalQuantityKg) || totalQuantityKg <= 0) {
      throw new TypeError('Total production quantity must be a finite number greater than zero kg.');
    }
    if (!Array.isArray(machines)) throw new TypeError('Machines must be an array of capacities or machine objects.');
    if (!validPercentage(maximumLoadingPercent)) throw new TypeError('Maximum loading percentage must be greater than 0 and at most 100.');
    for (const callback of [availability, productionEligibility]) {
      if (callback !== undefined && typeof callback !== 'function') throw new TypeError('Machine constraints must be functions.');
    }
    const quantity = decimalFraction(totalQuantityKg);
    const evaluations = machines.map((input, inputIndex) => {
      const machine = typeof input === 'number' ? {capacityKg:input} : input;
      const reasons = [];
      const capacityKg = machine?.capacityKg;
      const limit = machine?.maximumLoadingPercent === undefined ? maximumLoadingPercent : machine.maximumLoadingPercent;
      const row = {machine:machine || {}, inputIndex, id:machine?.id ?? inputIndex + 1,
        capacityKg:capacityKg ?? null, maximumLoadingPercent:limit,
        batches:null, batchQuantityKg:null, actualLoadingPercent:null,
        eligible:false, selected:false, rank:null, rejectionReasons:reasons, remarks:''};
      if (!machine || typeof machine !== 'object') reasons.push('Invalid machine record.');
      if (typeof capacityKg !== 'number' || !Number.isFinite(capacityKg) || capacityKg <= 0) reasons.push('Capacity must be a finite number greater than zero kg.');
      if (!validPercentage(limit)) reasons.push('Invalid permitted loading percentage.');
      if (typeof capacityKg === 'number' && Number.isFinite(capacityKg) && capacityKg > 0 && validPercentage(limit)) {
        const capacity = decimalFraction(capacityKg), percentage = decimalFraction(limit);
        const numerator = quantity.n * capacity.d * percentage.d * 100n;
        const denominator = quantity.d * capacity.n * percentage.n;
        const batchesExact = (numerator + denominator - 1n) / denominator;
        if (batchesExact < 1n || batchesExact > BigInt(Number.MAX_SAFE_INTEGER)) {
          reasons.push('Batch count is outside the supported numeric range.');
        } else {
          row.batches = Number(batchesExact);
          row.batchQuantityKg = fractionNumber(quantity.n, quantity.d * batchesExact);
          const loading = {n:quantity.n * capacity.d * 100n, d:quantity.d * batchesExact * capacity.n};
          exactLoading.set(row, loading);
          row.actualLoadingPercent = fractionNumber(loading.n, loading.d);
          if (loading.n * percentage.d > percentage.n * loading.d) reasons.push('Actual loading exceeds the permitted loading percentage.');
        }
      }
      if (machine?.available === false) reasons.push('Machine is unavailable.');
      if (machine?.eligible === false) reasons.push('Machine is not eligible for this production.');
      if (Array.isArray(machine?.rejectionReasons)) {
        for (const reason of machine.rejectionReasons) if (typeof reason === 'string' && reason.trim()) reasons.push(reason.trim());
      }
      if (machine && typeof machine === 'object') {
        if (availability) reasons.push(...constraintReasons(availability(machine, inputs), 'Machine is unavailable.'));
        if (productionEligibility) reasons.push(...constraintReasons(productionEligibility(machine, inputs), 'Machine is not eligible for this production.'));
      }
      row.eligible = reasons.length === 0;
      row.remarks = row.eligible ? 'Eligible.' : reasons.join(' ');
      return row;
    });
    const ranking = evaluations.filter(row => row.eligible).sort(compareConfigurations);
    if (!ranking.length) {
      throw new MachineSelectionError('No eligible machine configuration exists. Check machine availability, production eligibility, capacities and permitted loading percentages.', evaluations);
    }
    const selected = ranking[0];
    selected.selected = true;
    ranking.forEach((row, index) => {
      row.rank = index + 1;
      if (row === selected) row.remarks = 'Selected: fewest batches, then highest loading, then smallest capacity.';
      else if (row.batches > selected.batches) row.remarks = 'Not selected: requires more batches.';
      else if (compareLoading(row, selected) > 0) row.remarks = 'Not selected: lower loading with the same batch count.';
      else if (row.capacityKg > selected.capacityKg) row.remarks = 'Not selected: larger capacity with equal batch count and loading.';
      else row.remarks = 'Equivalent configuration; earlier input selected.';
    });
    return {totalQuantityKg, maximumLoadingPercent, selected, evaluations, ranking};
  }
  // Display-only formatting. None of these rounded strings influence selection.
  function formatEvaluations(evaluations, {quantityDecimals=3, percentageDecimals=2} = {}) {
    if (!Array.isArray(evaluations)) throw new TypeError('Evaluations must be an array.');
    return evaluations.map(row => ({
      machineId:row.id,
      capacityKg:typeof row.capacityKg === 'number' && Number.isFinite(row.capacityKg) ? row.capacityKg.toFixed(quantityDecimals) : '—',
      batches:row.batches ?? '—',
      batchQuantityKg:row.batchQuantityKg === null ? '—' : row.batchQuantityKg.toFixed(quantityDecimals),
      maximumLoadingPercent:validPercentage(row.maximumLoadingPercent) ? row.maximumLoadingPercent.toFixed(percentageDecimals) + '%' : '—',
      actualLoadingPercent:row.actualLoadingPercent === null ? '—' : row.actualLoadingPercent.toFixed(percentageDecimals) + '%',
      eligibility:row.eligible ? 'Eligible' : 'Rejected',
      selected:row.selected, rank:row.rank, remarks:row.remarks
    }));
  }
  return Object.freeze({selectMachine, formatEvaluations, compareConfigurations,
    MachineSelectionError, DEFAULT_MAXIMUM_LOADING_PERCENT});
});


/* ERP-specific adapter. The reusable selector itself has no factory rules.
   Every Setup machine is evaluated; constraints explain why a row is rejected. */
function erpMachineConfigurations(shade, floor, fabrics) {
  const pool = new Set(machineFloorsForMenu(floor));
  return getMachineSetup().filter(machine => pool.has(normalizeFloor(machine.floor)) && String(machine.mcType).trim().toUpperCase()==='BULK').map((machine, index) => {
    const reasons = [];
    if (String(machine.mcType).trim().toUpperCase() !== 'BULK') reasons.push('MC Type must be Bulk.');
    if (!machineAllowsFabrics(machine, fabrics)) reasons.push('Fabric or GSM is restricted by Setup.');
    if (!String(machine.mcBrand ?? '').trim() || !String(machine.mcNo ?? '').trim()) reasons.push('Machine brand or number is missing.');
    const text = String(machine.loading ?? '').trim();
    const configured = text === '' ? BATCH_CALCULATION.defaultMaximumLoadingPercent : loadingFraction(machine.loading) * 100;
    // Preserve the earlier textile-specific Semi Bleach exception in this adapter.
    // GenericMachineSelection never applies colour-specific or fixed limits.
    const maximumLoadingPercent = isSemiBleach(shade) ? BATCH_CALCULATION.semiBleachLoading * 100 : configured;
    return {...machine, id:machine.id ?? index + 1,
      capacityKg:fabricQuantity(machine.capacity), maximumLoadingPercent,
      label:String(machine.mcBrand ?? '').trim() + '-' + String(machine.mcNo ?? '').trim(),
      rejectionReasons:reasons};
  });
}

// No integer scaling or rounding is used when distributing production quantities.
function splitColourQuantities(quantitiesKg, batchCount) {
  return Array.from({length:batchCount}, () => quantitiesKg.map(quantity => quantity / batchCount));
}
/* Popup evaluations and saved manual machine selections.
   Choices belong to one booking, floor and normalized colour, so selecting a
   machine never changes another floor's or another colour's saved preference. */
const MACHINE_FLOOR_POOLS = { EFL:['EFL'], EKL:['EKL','EXT'], EXT:['EXT'], PLUVIA:['PLUVIA'], OUTSIDE:['OUTSIDE'] };
function machineFloorsForMenu(floor) { return MACHINE_FLOOR_POOLS[floor] || []; }
function colourSelectionKey(shade) { return String(shade ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }
function machineEvaluationKey(group) { return group.selectionKey || colourSelectionKey(group.shade); }
function dyeingBatchGroupKey(shade,group) { return JSON.stringify([colourSelectionKey(shade),group || 'together']); }
function savedColourMachine(booking, floor, shade, selectionKey=colourSelectionKey(shade)) {
  const preferences = reportManualState(booking,floor).machineSelections;
  return preferences?.[selectionKey] ?? preferences?.[colourSelectionKey(shade)] ?? null;
}
let currentReportMachineEvaluations = [];
let machineEvaluationContext = null;

function renderMachineEvaluationRows(index = 0) {
  const group = currentReportMachineEvaluations[index];
  if (!group) return '';
  const display = GenericMachineSelection.formatEvaluations(group.rows);
  const rows = group.rows.map((row, i) => {
    const applied = row.applied;
    const remarks = applied
      ? (row.appliedBy === 'manual' ? 'Loaded manually for this colour. ' : 'Applied automatically. ') + (row.selected ? 'Recommended by algorithm.' : row.remarks)
      : row.selected ? 'Recommended by algorithm.' : row.remarks;
    return `<tr class="${applied ? 'machine-selected' : row.selected ? 'machine-recommended' : ''}">
      <td>${esc(row.machine.label || row.id)}</td><td>${esc(row.machine.floor || '')}</td>
      <td>${esc(display[i].capacityKg)}</td><td>${esc(display[i].batches)}</td>
      <td title="Unrounded: ${esc(row.batchQuantityKg ?? '')}">${esc(display[i].batchQuantityKg)}</td>
      <td>${esc(display[i].maximumLoadingPercent)}</td>
      <td title="Unrounded: ${esc(row.actualLoadingPercent ?? '')}">${esc(display[i].actualLoadingPercent)}</td>
      <td>${esc(display[i].eligibility)}</td><td>${esc(remarks)}</td>
      <td><button type="button" class="btn load-mc-button" data-load-mc-id="${esc(String(row.id))}" data-mc-eligible="${row.eligible}"
        title="${esc(row.eligible ? 'Apply this machine to this colour and save' : row.remarks)}"
        ${!row.eligible || mutationBusy || !storageReady || confirmedReportLocked() ? 'disabled' : ''}>Load MC</button></td>
    </tr>`;
  });
  const error = group.error ? `<p class="batch-calculation-note">${esc(group.error)}</p>` : '';
  return error + table(['Machine', 'Floor', 'Capacity (kg)', 'Batches', 'Qty / Batch (kg)', 'Maximum Loading', 'Actual Loading', 'Eligibility', 'Selection Remarks', 'Action'], rows);
}
function refreshMachineEvaluationPopup(shadeKey) {
  if (!machineEvaluationContext) return;
  const index = Math.max(0, currentReportMachineEvaluations.findIndex(group => machineEvaluationKey(group) === shadeKey));
  const group = currentReportMachineEvaluations[index];
  if (!group) { closeMachineEvaluation(); return; }
  machineEvaluationContext.shadeKey = machineEvaluationKey(group);
  $('machineEvaluationTitle').textContent = 'Machine Selection Evaluation · ' + machineEvaluationContext.number + ' · ' + floorLabel(machineEvaluationContext.floor);
  $('machineEvaluationColour').innerHTML = currentReportMachineEvaluations.map((value,i) => `<option value="${i}" ${i === index ? 'selected' : ''}>${esc((value.shade || 'Blank colour')+(value.groupLabel?' · '+value.groupLabel:''))}</option>`).join('');
  $('machineEvaluationRows').innerHTML = renderMachineEvaluationRows(index);
}
function openMachineEvaluation() {
  if (reportRowEditor) {toast('Save or cancel the edited row first.');return;}
  if (!currentViewingNumber || !currentViewingFloor || !currentReportMachineEvaluations.length) return;
  machineEvaluationContext = {number:currentViewingNumber, floor:currentViewingFloor, shadeKey:machineEvaluationKey(currentReportMachineEvaluations[0])};
  $('machineEvaluationStatus').textContent = '';
  refreshMachineEvaluationPopup(machineEvaluationContext.shadeKey);
  $('machineEvaluationDialog').classList.remove('hidden');
  $('machineEvaluationDialog').setAttribute('aria-hidden','false');
  $('machineEvaluationColour').focus();
}
function closeMachineEvaluation() {
  machineEvaluationContext = null;
  $('machineEvaluationDialog').classList.add('hidden');
  $('machineEvaluationDialog').setAttribute('aria-hidden','true');
  const button = $('btnMachineEvaluation');
  if (button) button.focus();
}
async function loadMachineForColour(machineId) {
  if (!machineEvaluationContext || !canEditReport() || !reportDraft) return false;
  if (reportRowEditor) {toast('Save or cancel the row being edited before loading a machine.');return false;}
  const context={...machineEvaluationContext},before=copyReportData(reportDraft);
  if (currentViewingNumber!==context.number || currentViewingFloor!==context.floor || activeFloor!==context.floor) {closeMachineEvaluation();return false;}
  const booking=currentReportBooking();if(!booking)return false;
  buildEditableReportTables(getFloorBooking(booking,context.floor),context.floor);
  const group=currentReportMachineEvaluations.find(value=>machineEvaluationKey(value)===context.shadeKey);
  const configuration=group?.rows.find(row=>String(row.id)===String(machineId));
  if(!configuration?.eligible){$('machineEvaluationStatus').textContent=configuration?.remarks || 'This machine is no longer eligible for the selected colour.';return false;}
  if(configuration.batches>BATCH_CALCULATION.maxRenderedBatches){$('machineEvaluationStatus').textContent='This selection exceeds the report row limit. Choose a larger eligible machine.';return false;}
  reportDraft.manual.machineSelections={...reportDraft.manual.machineSelections,[context.shadeKey]:{machineId:configuration.id}};
  applyMachineToManualBatchRows(group,configuration);
  reportDraft.dirty=true;
  setMutationBusy(true);
  try {
    const retained=await retainSavedReportDraft();
    if(currentViewingNumber===context.number && currentViewingFloor===context.floor){
      const keepMachinePopup=!!machineEvaluationContext;
      refreshEditableReport({keepMachinePopup});
      if(keepMachinePopup){refreshMachineEvaluationPopup(context.shadeKey);$('machineEvaluationStatus').textContent=configuration.machine.label+(retained?' loaded and saved for ':' loaded in draft for ')+group.shade+(retained?'.':'. '+reportSaveHint());}
    }
    toast(retained?'Machine loaded and saved.':'Machine loaded in draft. '+reportSaveHint());
    return true;
  }catch(error){
    if(currentViewingNumber===context.number && currentViewingFloor===context.floor)reportDraft=before;
    showSaveError(error);
    if(currentViewingNumber===context.number && currentViewingFloor===context.floor){refreshEditableReport({keepMachinePopup:!!machineEvaluationContext});if(machineEvaluationContext){refreshMachineEvaluationPopup(context.shadeKey);$('machineEvaluationStatus').textContent='Could not save. Previous machine assignment remains in place.';}}
    return false;
  }finally{setMutationBusy(false);}
}
$('reportContent').addEventListener('click', event => { if (event.target.closest('#btnMachineEvaluation')) openMachineEvaluation(); });
$('machineEvaluationColour').addEventListener('change', event => {
  const index = Number(event.target.value);
  const group = currentReportMachineEvaluations[index];
  if (!machineEvaluationContext || !group) return;
  machineEvaluationContext.shadeKey = machineEvaluationKey(group);
  $('machineEvaluationStatus').textContent = '';
  $('machineEvaluationRows').innerHTML = renderMachineEvaluationRows(index);
});
$('machineEvaluationRows').addEventListener('click', event => {
  const button = event.target.closest('[data-load-mc-id]');
  if (button && !button.disabled) loadMachineForColour(button.dataset.loadMcId);
});
$('btnCloseMachineEvaluation').addEventListener('click', closeMachineEvaluation);
$('machineEvaluationDialog').addEventListener('click', event => { if (event.target === $('machineEvaluationDialog')) closeMachineEvaluation(); });
$('machineEvaluationDialog').addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); closeMachineEvaluation(); }
  if (event.key === 'Tab') {
    const elements = [...$('machineEvaluationDialog').querySelectorAll('button,select')].filter(element => !element.disabled);
    const first = elements[0], last = elements[elements.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});


// Decimal source quantities stay unrounded; only table cells are formatted.
function productionFraction(value) {
  const [coefficient,exponent='0']=String(value).toLowerCase().split('e');
  const [whole,fraction='']=coefficient.split('.'),power=Number(exponent)-fraction.length;
  return power>=0?{n:BigInt(whole+fraction)*10n**BigInt(power),d:1n}:{n:BigInt(whole+fraction),d:10n**BigInt(-power)};
}
function productionSum(values) {
  let n=0n,d=1n;
  for(const value of values){if(!Number.isFinite(value))continue;const part=productionFraction(value);n=n*part.d+part.n*d;d*=part.d;let a=n<0n?-n:n,b=d;while(b){const next=a%b;a=b;b=next;}if(a){n/=a;d/=a;}}
  return Number(n)/Number(d);
}
function productionMultiply(a,b){const x=productionFraction(a),y=productionFraction(b);return Number(x.n*y.n)/Number(x.d*y.d);}
function availableComponentKinds(booking,floor) {
  if(!booking)return [];
  const kinds=new Set(getReportBpRows(booking,floor).flatMap(row=>componentKinds(bpValue(row,'details'))));
  return COMPONENT_KINDS.filter(([kind])=>kinds.has(kind)).map(([kind])=>kind);
}
function fabricDyeingChoice(booking,floor,fabricKey,shade) {
  const choices=reportManualState(booking,floor).fabricSeparate?.[fabricKey];
  const key=colourSelectionKey(shade);
  return choices && Object.prototype.hasOwnProperty.call(choices,key)?choices[key]:choices?.['*'];
}
function componentIsSeparate(booking,floor,kind,shade=null,fabricType=null) {
  if(componentDyeingType(booking,floor,kind)==='YD')return true;
  if(shade!==null && fabricType!==null) {
    const choice=fabricDyeingChoice(booking,floor,'component:'+kind+':'+colourSelectionKey(fabricType),shade);
    if(choice!==undefined)return choice===true;
  }
  return reportManualState(booking,floor).componentSeparate?.[kind]===true;
}
function componentFabricRows(booking,floor) {
  const groups=new Map();
  for(const row of getReportBpRows(booking,floor))for(const kind of componentKinds(bpValue(row,'details'))) {
    const type=String(bpValue(row,'fabricType')).trim(),key='component:'+kind+':'+colourSelectionKey(type);
    if(!groups.has(key))groups.set(key,{key,type,kind,pcs:[],kg:[],missingPcs:false,missingKg:false});
    const group=groups.get(key),pcs=fabricQuantity(bpValue(row,'quantity')),kg=fabricQuantity(bpValue(row,'quantityKg'));
    if(pcs===null)group.missingPcs=true;else group.pcs.push(pcs);
    if(kg===null)group.missingKg=true;else group.kg.push(kg);
  }
  return Array.from(groups.values()).map(group=>({key:group.key,type:group.type,componentKind:group.kind,
    composition:'',yarn:'',gsm:'',width:'',gaugeDia:'',greyWaste:'',greigeQty:'',dryMethod:'',remarks:'',
    requiredFinish:(group.missingPcs?'—':kgText(productionSum(group.pcs)))+' Pcs & '+(group.missingKg?'—':kgText(productionSum(group.kg)))+' Kg'}));
}
function componentRowTotals(row) {
  row.totalPcs=productionSum(Object.values(row.quantities || {}));
  const parts=Object.entries(row.quantities || {}).filter(([,qty])=>qty>0);
  row.totalKg=parts.some(([size])=>row.weights?.[size]===null || !Number.isFinite(row.weights?.[size]) || row.weights[size]<0)?null:productionSum(parts.map(([size,qty])=>productionMultiply(qty,row.weights[size])));
  return row;
}
function bodyBatchQuantity(row,fabrics=currentFabricRows) {
  const componentKeys=new Set(fabrics.filter(fabric=>fabric.componentKind).map(fabric=>fabric.key));
  return productionSum(Object.entries(row.quantities || {}).filter(([key])=>!componentKeys.has(key)).map(([,qty])=>fabricQuantity(qty) || 0));
}
function componentMassIndex(sections) {
  const index=new Map();index.kinds=sections.map(section=>section.kind);
  for(const section of sections)for(const row of section.rows){const key=JSON.stringify([String(row.id),colourSelectionKey(row.shade)]);if(!index.has(key))index.set(key,{});const totals=index.get(key);totals[section.kind]=row.totalKg===null || totals[section.kind]===null?null:productionSum([totals[section.kind] || 0,row.totalKg]);}
  return index;
}
function batchMass(row,sections) {
  const componentKg={},bodyKg=bodyBatchQuantity(row);
  const index=sections instanceof Map?sections:componentMassIndex(sections),totals=index.get(JSON.stringify([String(row.id),colourSelectionKey(row.shade)])) || {};
  for(const kind of index.kinds)componentKg[kind]=totals[kind]===null?null:totals[kind] || 0;
  return {bodyKg,componentKg,totalKg:Object.values(componentKg).some(qty=>qty===null)?null:productionSum([bodyKg,...Object.values(componentKg)])};
}
function machineFabricsWithComponents(fabrics,booking,floor,shade,bodyRows,targetRows=bodyRows) {
  if(!booking)return fabrics;
  const key=colourSelectionKey(shade),sections=buildComponentBatches(booking,floor,bodyRows),ids=new Set(targetRows.map(row=>String(row.id)));
  return [...fabrics,...sections.flatMap(section=>section.rows.filter(row=>!row.separate && ids.has(String(row.id)) && colourSelectionKey(row.shade)===key && row.totalPcs>0).map(row=>({type:row.fabricType,gsm:'',componentKind:section.kind})))];
}
function componentColourSummary(booking,floor,shades) {
  const seeds=shades.map((shade,index)=>({id:normalizeBookingKey(booking.number)+String(index+1).padStart(3,'0'),shade,quantities:{}}));
  const sections=buildComponentBatches(booking,floor,seeds),summary=new Map();
  for(const shade of shades){const key=colourSelectionKey(shade),rows=sections.flatMap(section=>section.rows.filter(row=>!row.separate && colourSelectionKey(row.shade)===key).map(row=>({...row,componentKind:section.kind})));summary.set(key,{kg:productionSum(rows.map(row=>row.totalKg ?? 0)),missing:rows.some(row=>row.totalKg===null),fabrics:rows.filter(row=>row.totalPcs>0).map(row=>({type:row.fabricType,gsm:'',componentKind:row.componentKind}))});}
  return summary;
}
// The generic ceil/distribution/ranking formula is unchanged. This validation
// also checks actual whole-piece allocations against each candidate's limit.
function evaluateCombinedMachines({totalQuantityKg,bodyQuantityKg,machines,booking,floor,shade,bodyRows=[],dyeingGroup,componentAnchor}) {
  let initial;
  try{initial=GenericMachineSelection.selectMachine({totalQuantityKg,machines,maximumLoadingPercent:BATCH_CALCULATION.defaultMaximumLoadingPercent});}
  catch(error){if(error instanceof GenericMachineSelection.MachineSelectionError)throw error;throw error;}
  if(!availableComponentKinds(booking,floor).length)return initial;
  const portions=new Map(),key=colourSelectionKey(shade);
  for(const config of initial.evaluations) {
    if(!config.eligible || config.batches>BATCH_CALCULATION.maxRenderedBatches)continue;
    if(!portions.has(config.batches)) {
      const matches=row=>colourSelectionKey(row.shade)===key && row.dyeingGroup===dyeingGroup;
      const source=bodyRows.filter(matches);
      const proposed=Array.from({length:config.batches},(_,index)=>({id:source[index]?.id || '',manualNumber:!!source[index]?.id,shade,quantities:{},tallBig:source[index]?.tallBig || (automaticTallBig(booking,floor)?source[0]?.tallBig:'') || '',...(dyeingGroup===undefined?{}:{dyeingGroup,componentAnchor})}));
      const others=bodyRows.filter(row=>!matches(row));
      const proposedRows=[...others,...proposed];renumberReportBatches(proposedRows,booking.number);
      const prior=currentReportBatchRowsTruncated;currentReportBatchRowsTruncated=false;
      let sections;try{sections=buildComponentBatches(booking,floor,proposedRows);}finally{currentReportBatchRowsTruncated=prior;}
      portions.set(config.batches,proposed.map(row=>{const mass=batchMass(row,sections);return mass.totalKg===null?null:productionSum([bodyQuantityKg/config.batches,mass.totalKg]);}));
    }
    const weights=portions.get(config.batches),machine=machines.find(machine=>String(machine.id)===String(config.id));
    if(weights.some(weight=>weight===null)){machine.rejectionReasons.push('Weight /Pcs is missing for a together component.');continue;}
    const maximum=Math.max(...weights);
    if(maximum>0){try{const one=GenericMachineSelection.selectMachine({totalQuantityKg:maximum,machines:[config.machine],maximumLoadingPercent:BATCH_CALCULATION.defaultMaximumLoadingPercent});if(one.selected.batches!==1)machine.rejectionReasons.push('Whole-piece component allocation exceeds this machine’s permitted loading in a batch.');}catch(error){if(!(error instanceof GenericMachineSelection.MachineSelectionError))throw error;machine.rejectionReasons.push('Component batch loading exceeds the machine limit.');}}
  }
  return GenericMachineSelection.selectMachine({totalQuantityKg,machines,maximumLoadingPercent:BATCH_CALCULATION.defaultMaximumLoadingPercent});
}
function isCalculatedBatchField(field){return field==='knitStatus' || field==='totalKg' || field.startsWith('componentKg:') || field.startsWith('qty:') && currentFabricRows.some(fabric=>fabric.key===field.slice(4) && fabric.componentKind);}
function tallBigSettings(booking=currentReportBooking(),floor=currentViewingFloor) {
  return booking?reportManualState(booking,floor).tallBig || {enabled:false,declarations:{}}:{enabled:false,declarations:{}};
}
function tallBigEnabled(booking=currentReportBooking(),floor=currentViewingFloor) {
  return !!booking && availableComponentKinds(booking,floor).length>0 && tallBigSettings(booking,floor).enabled===true;
}
function tallBigBatchType(row,booking,floor) {
  return tallBigEnabled(booking,floor)?(['No','Tall','Big'].includes(row.tallBig)?row.tallBig:''):'No';
}
function automaticTallBig(booking=currentReportBooking(),floor=currentViewingFloor){return tallBigEnabled(booking,floor) && !!tallBigSettings(booking,floor).bodyDeclarations;}
function tallBigSaveError(booking,floor) {
  if(!tallBigEnabled(booking,floor))return '';
  const data=captureConfirmedReport(booking,floor);
  const missing=data.rows.find(row=>!['No','Tall','Big'].includes(row.tallBig));
  if(missing)return 'Select No, Tall or Big for batch '+(missing.id || missing.shade)+ ' before saving the batch plan.';
  if(data.truncated)return 'Tall/Big allocation requires the complete batch list.';
  for(const section of data.components || [])if(section.tallBigErrors?.length)return section.title+': '+section.tallBigErrors[0];
  return '';
}
function preserveTallBigBatchEdits() {
  if(reportDraft?.manual.tallBig?.enabled)reportDraft.manual.tallBig.createdBatchOverride=false;
}
function tallBigControl(booking,floor) {
  if(!availableComponentKinds(booking,floor).length)return '';
  return `<label class="btn secondary tall-big-control">Tall/Big size <select id="tallBigEnabled" aria-label="Tall/Big size" ${confirmedReportLocked(booking,floor)?'disabled':''}><option value="No" ${!tallBigEnabled(booking,floor)?'selected':''}>No</option><option value="Yes" ${tallBigEnabled(booking,floor)?'selected':''}>Yes</option></select></label>${tallBigEnabled(booking,floor)?`<button type="button" class="btn secondary" data-edit-main-tall-big ${confirmedReportLocked(booking,floor)?'disabled':''}>Declare Tall/Big Qty</button>`:''}`;
}
async function changeTallBigEnabled(value) {
  if(!['Yes','No'].includes(value) || !reportDraft || !canEditReport() || !availableComponentKinds(currentReportBooking(),currentViewingFloor).length)return false;
  if(reportRowEditor){toast('Save or cancel the row being edited first.');refreshEditableReport();return false;}
  if(value==='Yes' && currentReportBatchRowsTruncated){toast('Tall/Big size requires the complete batch list. Use a configuration within the report row limit first.');refreshEditableReport();return false;}
  if(value==='Yes')return openBodyTallBigDeclaration();
  const before=copyReportData(reportDraft),settings=copyReportData(tallBigSettings());
  if((value==='Yes')===(settings.enabled===true)){refreshEditableReport();return true;}
  if(value==='Yes' && !settings.enabled){
    settings.createdBatchOverride=!reportDraft.manual.batchRows;
    reportDraft.manual.batchRows=copyReportData(currentBatchRows).map(row=>({...row,tallBig:['No','Tall','Big'].includes(row.tallBig)?row.tallBig:''}));
  }else if(value==='No' && settings.bodyDeclarations){settings.enabled=false;reportDraft.manual.tallBig=settings;try{reportDraft.manual.batchRows=generateBodyTallBigRows(currentReportBooking(),currentViewingFloor,currentFabricRows,currentBatchRows,{});}catch(error){reportDraft=before;refreshEditableReport();toast(error.message);return false;}delete settings.bodyDeclarations;settings.createdBatchOverride=false;}
  else if(value==='No' && settings.createdBatchOverride){const saved=savedReportPlan(currentReportBooking(),currentViewingFloor).confirmedSnapshot?.reportData;reportDraft.manual.batchRows=saved?copyReportData(saved.rows):null;settings.createdBatchOverride=false;}
  settings.enabled=value==='Yes';reportDraft.manual.tallBig=settings;reportDraft.dirty=true;setMutationBusy(true);
  try{const retained=await retainSavedReportDraft();refreshEditableReport();toast(retained?'Tall/Big size saved.':value==='Yes'?'Choose No, Tall or Big for every batch before saving.':'Tall/Big size disabled. '+reportSaveHint());return true;}
  catch(error){reportDraft=before;refreshEditableReport();showSaveError(error);return false;}finally{setMutationBusy(false);}
}
async function changeBatchTallBig(index,value) {
  if(!reportDraft || !canEditReport() || !tallBigEnabled() || !['No','Tall','Big'].includes(value) || !currentBatchRows[index])return false;
  if(automaticTallBig()){toast('Declare fabric quantities to set Tall/Big automatically.');return false;}
  if(reportRowEditor){toast('Save or cancel the row being edited first.');refreshEditableReport();return false;}
  if(currentBatchRows[index].tallBig===value)return true;
  const before=copyReportData(reportDraft),rows=copyReportData(currentBatchRows);rows[index].tallBig=value;
  reportDraft.manual.batchRows=rows;reportDraft.dirty=true;setMutationBusy(true);
  try{await retainSavedReportDraft();refreshEditableReport();return true;}
  catch(error){reportDraft=before;refreshEditableReport();showSaveError(error);return false;}finally{setMutationBusy(false);}
}
$('reportContent').addEventListener('change',event=>{if(event.target.id==='tallBigEnabled')changeTallBigEnabled(event.target.value);if(event.target.matches('[data-batch-tall-big]'))changeBatchTallBig(Number(event.target.dataset.batchTallBig),event.target.value);});
$('reportContent').addEventListener('click',event=>{if(event.target.closest('[data-edit-main-tall-big]'))openBodyTallBigDeclaration();});
function ccDyeingModeControl(booking,floor) {
  const options=dyeingModeOptions(booking,floor),locked=confirmedReportLocked(booking,floor),disabled=locked?'disabled':'';
  const state=option=>option.colours.map(shade=>option.componentKind?componentIsSeparate(booking,floor,option.componentKind,shade,option.type):fabricDyeingChoice(booking,floor,option.key,shade)===true);
  const checkbox=(values)=>values.length && values.every(Boolean)?'checked':values.some(Boolean)?'aria-checked="mixed" data-mode-partial':'';
  return `<details class="cc-mode-control" id="ccDyeingMode"><summary role="button" class="btn secondary" id="btnCCMode">Dyeing Mode ▾</summary><div class="cc-mode-popover"><strong>All Together, Except…</strong><label class="sr-only" for="ccModeSearch">Search fabrics or colours</label><input id="ccModeSearch" type="search" placeholder="Search" autocomplete="off"><label class="cc-mode-option"><input type="checkbox" data-cc-all ${checkbox(options.flatMap(state))} ${disabled}> Select All</label><div class="cc-mode-fabrics">${options.map(option=>`<details class="cc-mode-fabric" data-cc-option="${esc(option.key)}"><summary><input type="checkbox" data-mode-fabric-all="${esc(option.key)}" aria-label="All colours for ${esc(option.name)}" ${checkbox(state(option))} ${disabled}><span>${esc(option.name)}</span></summary><small>${esc(option.type || 'Fabric details not entered')}</small><div class="cc-mode-colours"><label class="cc-mode-option"><input type="checkbox" data-mode-fabric-all="${esc(option.key)}" ${checkbox(state(option))} ${disabled}> All Colour</label>${option.colours.map(shade=>`<label class="cc-mode-option"><input type="checkbox" data-mode-fabric="${esc(option.key)}" data-mode-colour="${esc(colourSelectionKey(shade))}" ${(option.componentKind?componentIsSeparate(booking,floor,option.componentKind,shade,option.type):fabricDyeingChoice(booking,floor,option.key,shade)===true)?'checked':''} ${disabled}> ${esc(shade || 'Blank colour')}</label>`).join('')}</div></details>`).join('')}</div>${options.length?'':'<small>No fabrics available yet.</small>'}<small>Checked fabric colours use separate batches. Peach and non-peach fabrics are always grouped separately. Component Dyeing Type YD remains separate.</small>${locked?'<small>This confirmed plan is read-only.</small>':''}</div></details>`;
}
function dyeingModeOptions(booking,floor) {
  const allColours=new Map(),byFabric=new Map();
  const add=(key,shade)=>{if(!String(shade || '').trim())return;const normalized=colourSelectionKey(shade);allColours.set(normalized,String(shade).trim());if(!byFabric.has(key))byFabric.set(key,new Map());byFabric.get(key).set(normalized,String(shade).trim());};
  for(const row of getReportKnittingRows(booking.number,floor))add(rowFabricKey(row),firstUploadedValue(row,BATCH_CALCULATION.colorHeaders));
  for(const row of currentBatchRows)for(const [key,qty] of Object.entries(row.quantities || {}))if(qty>0)add(key,row.shade);
  for(const row of getReportBpRows(booking,floor))for(const kind of componentKinds(bpValue(row,'details')))add('component:'+kind+':'+colourSelectionKey(bpValue(row,'fabricType')),bpValue(row,'colour'));
  return reportFabricSlots().map(fabric=>({...fabric,colours:Array.from((byFabric.get(fabric.key)?.size?byFabric.get(fabric.key):allColours).values())}));
}
async function changeFabricDyeingMode(fabricKey,shadeKey,checked) {
  if(!reportDraft || !canEditReport())return false;
  if(reportRowEditor){toast('Save or cancel the row being edited first.');refreshEditableReport();return false;}
  const options=dyeingModeOptions(currentReportBooking(),currentViewingFloor),targets=fabricKey==='all'?options:options.filter(option=>option.key===fabricKey);
  if(!targets.length)return false;
  const before=copyReportData(reportDraft),expanded=[...document.querySelectorAll('.cc-mode-fabric[open]')].map(element=>element.dataset.ccOption),search=$('ccModeSearch')?.value || '';
  const selected=copyReportData(reportDraft.manual.fabricSeparate || {});
  for(const option of targets)selected[option.key]=shadeKey==='*'?{'*':checked}:{...(selected[option.key] || {}),[shadeKey]:checked};
  reportDraft.manual.fabricSeparate=selected;
  if(reportDraft.manual.batchRows && targets.some(option=>!option.componentKind))reportDraft.manual.batchRows=regroupManualDyeingRows(currentBatchRows,currentFabricRows,currentReportBooking(),currentViewingFloor);
  reportDraft.dirty=true;setMutationBusy(true);
  try{await retainSavedReportDraft();refreshEditableReport();const popup=$('ccDyeingMode');if(popup)popup.open=true;for(const element of document.querySelectorAll('.cc-mode-fabric'))if(expanded.includes(element.dataset.ccOption))element.open=true;if($('ccModeSearch')){$('ccModeSearch').value=search;filterDyeingModeOptions(search);}return true;}
  catch(error){reportDraft=before;refreshEditableReport();showSaveError(error);return false;}finally{setMutationBusy(false);}
}
async function changeCCMode(kind,checked) {
  if(!reportDraft || !canEditReport())return false;
  if(reportRowEditor){toast('Save or cancel the row being edited first.');refreshEditableReport();return false;}
  const before=copyReportData(reportDraft),kinds=availableComponentKinds(currentReportBooking(),currentViewingFloor);
  const selected={...(reportDraft.manual.componentSeparate || {})};
  for(const item of kind==='all'?kinds:[kind])if(kinds.includes(item))selected[item]=checked;
  reportDraft.manual.componentSeparate=selected;reportDraft.dirty=true;setMutationBusy(true);
  try{await retainSavedReportDraft();refreshEditableReport();const popup=$('ccDyeingMode');if(popup)popup.open=true;return true;}
  catch(error){reportDraft=before;refreshEditableReport();showSaveError(error);return false;}finally{setMutationBusy(false);}
}
function filterDyeingModeOptions(value){const term=String(value).trim().toLowerCase();document.querySelectorAll('[data-cc-option]').forEach(option=>{option.hidden=!option.textContent.toLowerCase().includes(term);});}
$('reportContent').addEventListener('change',event=>{const input=event.target;if(input.matches('[data-cc-kind]'))changeCCMode(input.dataset.ccKind,input.checked);else if(input.matches('[data-cc-all]'))changeFabricDyeingMode('all','*',input.checked);else if(input.matches('[data-mode-fabric-all]'))changeFabricDyeingMode(input.dataset.modeFabricAll,'*',input.checked);else if(input.matches('[data-mode-fabric]'))changeFabricDyeingMode(input.dataset.modeFabric,input.dataset.modeColour,input.checked);});
$('reportContent').addEventListener('input',event=>{if(event.target.id==='ccModeSearch')filterDyeingModeOptions(event.target.value);});
async function deleteReportRow(kind,index) {
  if(!reportDraft || !canEditReport())return false;
  if(reportRowEditor && (reportRowEditor.kind!==kind || (!reportRowEditor.isNew && reportRowEditor.index!==index))){toast('Save or cancel the row being edited first.');return false;}
  if(reportRowEditor?.isNew){reportRowEditor=null;refreshEditableReport();return true;}
  if(kind==='batch' && currentReportBatchRowsTruncated){toast('Deletion requires the complete batch list.');return false;}
  const before=copyReportData(reportDraft),editor=copyReportData(reportRowEditor);
  const source=kind==='fabric'?currentFabricRows:kind==='batch'?currentBatchRows:auxiliarySourceRows(kind);
  if(!source[index])return false;
  const rows=copyReportData(source);rows.splice(index,1);
  if(kind==='fabric' || kind==='batch')preserveTallBigBatchEdits();
  if(kind==='fabric'){
    const key=source[index].key;reportDraft.manual.fabricRows=rows;
    // Freeze the displayed batches so removing a fabric cannot recreate it.
    reportDraft.manual.batchRows=copyReportData(currentBatchRows).map(row=>{delete row.quantities[key];return row;});
  }else if(kind==='batch'){
    reportDraft.manual.batchRows=rows;syncBodyTallBigQuantities(rows);
    for(const section of currentComponentSections)reportDraft.manual.componentRows[section.kind]=copyReportData(section.rows.filter(row=>row.bodyBatchId!==source[index].id && row.id!==source[index].id));
  }else if(kind==='instruction')reportDraft.manual.instructions=rows;
  else {reportDraft.manual.componentRows={...(reportDraft.manual.componentRows || {}),[kind.slice(10)]:rows};syncTallBigManualComponentRows(kind.slice(10),rows);}
  reportDraft.dirty=true;setMutationBusy(true);
  try{const retained=await retainSavedReportDraft();reportRowEditor=null;refreshEditableReport();toast(retained?'Row deleted and saved.':'Row deletion staged. '+reportSaveHint());return true;}
  catch(error){reportDraft=before;reportRowEditor=editor;refreshEditableReport();showSaveError(error);return false;}finally{setMutationBusy(false);}
}

// Finish grouping is an ERP input constraint. Each resulting group is passed
// through the unchanged generic quantity, loading and ranking formula.
function fabricBatchGroup(fabric,shade,peach,booking,floor) {
  const separate=fabricDyeingChoice(booking,floor,fabric.key,shade)===true;
  return {key:separate?'separate:'+fabric.key+':'+(peach?'peach':'regular'):peach?'peach':'together',
    label:separate?(fabric.name || 'Fabric')+(peach?' · Peach':' · Separate'):peach?'Peach':'Non-peach',peach};
}
function addDyeingGroupQuantity(colour,fabrics,index,quantity,peach,booking,floor) {
  const definition=fabricBatchGroup(fabrics[index],colour.shade,peach,booking,floor);
  if(!colour.groups.has(definition.key))colour.groups.set(definition.key,{...definition,quantities:Array(fabrics.length).fill(0)});
  const group=colour.groups.get(definition.key);group.quantities[index]=productionSum([group.quantities[index],quantity]);
}
function fabricPeachForColour(fabric,shade,booking,floor) {
  if(fabric.manual)return hasPeachFinish(fabric.remarks);
  const source=getReportKnittingRows(booking.number,floor).filter(row=>rowFabricKey(row)===fabric.key && colourSelectionKey(firstUploadedValue(row,BATCH_CALCULATION.colorHeaders))===colourSelectionKey(shade));
  return source.length?source.every(row=>hasPeachFinish(row._fabricColumns?.peach)):hasPeachFinish(fabric.remarks);
}
function orderDyeingModeBatches(rows,fabrics,booking,floor) {
  const quantity=(row,fabric,index)=>Array.isArray(row.quantities)?row.quantities[index]:row.quantities?.[fabric.key];
  const active=rows.some(row=>fabrics.some((fabric,index)=>!fabric.componentKind && quantity(row,fabric,index)>0 && fabricDyeingChoice(booking,floor,fabric.key,row.shade)===true));
  if(!active)return rows;
  // Number separated dyeing groups in Fabric Info order, regardless of the
  // uploaded item/colour order. Keep every batch of a fabric together.
  const firstFabric=row=>{const index=fabrics.findIndex((fabric,index)=>!fabric.componentKind && quantity(row,fabric,index)>0);return index<0?fabrics.length:index;};
  rows.sort((a,b)=>firstFabric(a)-firstFabric(b));
  return rows;
}
function generateColourBatches(booking, fabrics, floor = activeFloor) {
  const slots=new Map(fabrics.filter(fabric=>!fabric.componentKind).map(fabric=>[fabric.key,fabrics.indexOf(fabric)]));
  const colours=new Map();
  for(const row of getReportKnittingRows(booking.number,floor)) {
    const shade=String(firstUploadedValue(row,BATCH_CALCULATION.colorHeaders)).trim(),key=colourSelectionKey(shade),index=slots.get(rowFabricKey(row));
    if(index===undefined)continue; // A manually deleted fabric stays deleted.
    if(!colours.has(key))colours.set(key,{shade,quantities:Array(fabrics.length).fill(0),groups:new Map(),ld:new Map(),reference:new Map(),invalid:false});
    const colour=colours.get(key);
    addDistinctFabricValue(colour.ld,knittingInfoValue(row,'ld'));addDistinctFabricValue(colour.reference,knittingInfoValue(row,'reference'));
    const qty=fabricQuantity(knittingInfoValue(row,'greigeQty'));
    if(qty===null || qty<0){colour.invalid=true;addDyeingGroupQuantity(colour,fabrics,index,0,hasPeachFinish(row._fabricColumns?.peach),booking,floor);continue;}
    colour.quantities[index]=productionSum([colour.quantities[index],qty]);
    addDyeingGroupQuantity(colour,fabrics,index,qty,fabrics[index].manual?hasPeachFinish(fabrics[index].remarks):hasPeachFinish(row._fabricColumns?.peach),booking,floor);
  }
  // A manually edited Greige Qty is distributed across its uploaded colours in
  // their original greige proportions; finish quantities never drive loading.
  fabrics.forEach((fabric,index)=>{if(fabric.componentKind)return;const source=productionSum(Array.from(colours.values()).map(colour=>colour.quantities[index])),target=fabricQuantity(fabric.greigeQty);if(source>0 && target!==null && target>=0 && target!==source)for(const colour of colours.values())for(const group of colour.groups.values())group.quantities[index]=group.quantities[index]/source*target;});
  return createDyeingBatches(booking,fabrics,floor,colours);
}
function createDyeingBatches(booking,fabrics,floor,colours) {
  const warnings=[];
  const componentSummary=componentColourSummary(booking,floor,Array.from(colours.values()).map(colour=>colour.shade));
  const batches=[],evaluations=[],bookingKey=normalizeBookingKey(booking.number);
  for(const colour of colours.values()) {
    let groups=Array.from(colour.groups.values());
    if(groups.some(group=>group.quantities.some(qty=>qty>0)))groups=groups.filter(group=>group.quantities.some(qty=>qty>0));
    const together=componentSummary.get(colourSelectionKey(colour.shade));
    let anchor=groups.find(group=>group.key==='together') || groups.find(group=>group.key==='peach') || groups.find(group=>group.key==='components');
    if(!anchor && (together?.kg>0 || together?.missing)){anchor={key:'components',label:'Together components',peach:false,quantities:Array(fabrics.length).fill(0)};groups.push(anchor);}
    for(const group of groups) {
    const componentAnchor=group===anchor,components=componentAnchor?together:null;
    const bodyTotal=productionSum(group.quantities),total=productionSum([bodyTotal,components?.kg || 0]);
    const selectionKey=groups.length===1?colourSelectionKey(colour.shade):dyeingBatchGroupKey(colour.shade,group.key),groupLabel=groups.length===1?'':group.label;
    if(!colour.shade || !Number.isFinite(total))colour.invalid=true;
    const used=[...fabrics.filter((fabric,index)=>!fabric.componentKind && group.quantities[index]>0),...(components?.fabrics || [])];
    let selected=null;
    if(colour.invalid)warnings.push(`${colour.shade || 'Blank colour'}: check uploaded fabric, GSM, colour and non-negative Greige Qty; no machine was assigned.`);
    else if(total===0)warnings.push(`${colour.shade}: total quantity is zero; no machine was assigned.`);
    else if(floor) {
      const machines=erpMachineConfigurations(colour.shade,floor,used);
      if(components?.missing)machines.forEach(machine=>machine.rejectionReasons.push('BP Data Weight /Pcs is missing for together components.'));
      try {
        const evaluated=evaluateCombinedMachines({totalQuantityKg:total,bodyQuantityKg:bodyTotal,machines,booking,floor,shade:colour.shade,bodyRows:batches.map(batch=>autoBatchRow(batch,fabrics)),dyeingGroup:group.key,componentAnchor});
        selected=evaluated.selected;
        const preference=savedColourMachine(booking,floor,colour.shade,selectionKey),loaded=preference?evaluated.evaluations.find(row=>String(row.id)===String(preference.machineId) && row.eligible):null;
        if(loaded)selected=loaded;else if(preference)warnings.push(`${colour.shade}: the saved machine is not currently eligible; the recommended machine is applied.`);
        evaluated.evaluations.forEach(row=>{row.applied=row===selected;row.appliedBy=loaded?'manual':'automatic';});
        evaluations.push({shade:colour.shade,dyeingGroup:group.key,componentAnchor,selectionKey,groupLabel,rows:evaluated.evaluations,error:'',totalQuantityKg:total});
      }catch(error){if(!(error instanceof GenericMachineSelection.MachineSelectionError))throw error;warnings.push(`${colour.shade}${groupLabel?' · '+groupLabel:''}: ${error.message}`);evaluations.push({shade:colour.shade,dyeingGroup:group.key,componentAnchor,selectionKey,groupLabel,rows:error.evaluations,error:error.message,totalQuantityKg:total});}
    }
    const machine=selected?{...selected.machine,capacity:selected.capacityKg}:null,count=selected?.batches || 1,displayedCount=Math.min(count,BATCH_CALCULATION.maxRenderedBatches);
    if(displayedCount<count)warnings.push(`${colour.shade}: selected configuration requires ${count} batches. Only the first ${displayedCount} are displayed; evaluation and ranking use the complete configuration.`);
    for(let index=0;index<displayedCount;index++)batches.push({id:bookingKey+String(batches.length+1).padStart(3,'0'),shade:colour.shade,dyeingGroup:group.key,peachFinish:group.peach,componentAnchor,selectionKey,ld:Array.from(colour.ld.values()).join(', '),reference:Array.from(colour.reference.values()).join(', '),quantities:group.quantities.map(qty=>qty/count),totalQuantityKg:total/count,machine,loading:selected?String(Number(selected.actualLoadingPercent.toFixed(2)))+'%':'',nozzle:machine?machineNozzles(machine.capacity):''});
    }
  }
  orderDyeingModeBatches(batches,fabrics,booking,floor);
  batches.forEach((batch,index)=>{batch.id=bookingKey+String(index+1).padStart(3,'0');});
  return {batches,warnings,evaluations};
}

/* Manual report drafts. Pending edits stay in memory until the booking is
   saved as Tentative/Confirm. Saved bookings retain their approved snapshots. */
const FABRIC_ROW_FIELDS = [
  ['name','No of Fab'],['type','Fabric'],['composition','Fabric Composition'],['yarn','Yarn Count & Fabric'],
  ['gsm','GSM'],['width','Width'],['gaugeDia','Gauge & Dia'],['greyWaste','Grey Wst.%'],
  ['requiredFinish','Required (Finish)'],['greigeQty','Greige Qty'],['dryMethod','Dry Method'],['remarks','Remarks']
];
let reportDraft = null;
let reportRowEditor = null;
let currentFabricRows = [];
let currentBatchRows = [];
let currentReportBatchRowsTruncated = false;
function copyReportData(value) { return structuredClone(value); }
function savedReportPlan(booking,floor) { return floor ? booking.floorPlans?.[floor] || {} : booking; }
function reportBookingStatus(booking,floor) { return savedReportPlan(booking,floor).status || booking.status || 'Pending'; }
function emptyReportManual() { return {generalInfo:{},odBP:{},machineSelections:{},fabricRows:null,batchRows:null,componentTypes:{},componentSeparate:{},fabricSeparate:{},componentRows:{},tallBig:{enabled:false,declarations:{}},instructions:null}; }
function reportManualState(booking,floor) {
  if (reportDraft?.number === booking.number && reportDraft.floor === floor) return reportDraft.manual;
  if (!['Tentative','Confirm'].includes(reportBookingStatus(booking,floor))) return emptyReportManual();
  const plan = savedReportPlan(booking,floor);
  return {generalInfo:plan.reportOverrides?.generalInfo || {},odBP:plan.reportOverrides?.odBP || {},machineSelections:plan.machineSelections || {},fabricRows:plan.reportOverrides?.fabricRows || null,batchRows:plan.reportOverrides?.batchRows || null,componentTypes:plan.componentDyeingTypes || {},componentSeparate:plan.componentSeparate || {},fabricSeparate:plan.fabricDyeingSeparate || {},componentRows:plan.reportOverrides?.componentRows || {},tallBig:plan.tallBigSettings || {enabled:false,declarations:{}},instructions:plan.reportOverrides?.instructions ?? null};
}
function ensureReportDraft(booking,floor) {
  if (reportDraft?.number === booking.number && reportDraft.floor === floor && reportDraft.reviewLatest===currentReportReviewLatest) return;
  const manual = copyReportData(currentReportReviewLatest ? emptyReportManual() : reportManualState(booking,floor));
  reportDraft = {number:booking.number,floor,manual,dirty:false,reviewLatest:currentReportReviewLatest,reviewSourceRows:currentReportReviewLatest ? copyReportData(getKnittingRows(booking.number,floor)) : null,reviewBpRows:currentReportReviewLatest ? copyReportData(getBpRows(booking.number,floor)) : null};
  reportRowEditor = null;
}
function discardReportDraft() {
  closeTallBigDeclaration(false);closeODDeclaration();
  currentReportReviewLatest=false;
  reportDraft = null; reportRowEditor = null; currentFabricRows = []; currentBatchRows = []; currentReportBatchRowsTruncated=false;
}
function currentReportBooking() { return confirmedCaptureContext?.booking || getStoredMasterList().find(booking=>booking.number===currentViewingNumber); }
function reportFabricSlots(fabrics=currentFabricRows) {
  return fabrics.map((fabric,index)=>({...fabric,name:'Fabric '+(index+1)}));
}
function autoBatchRow(batch,fabrics) {
  return {rowKey:'auto:'+batch.id,id:batch.id,shade:batch.shade,ld:batch.ld,reference:batch.reference,
    dyeingGroup:batch.dyeingGroup,peachFinish:batch.peachFinish,componentAnchor:batch.componentAnchor,selectionKey:batch.selectionKey,
    quantities:Object.fromEntries(fabrics.map((fabric,index)=>[fabric.key,batch.quantities[index] || 0])),
    loading:batch.loading,nozzle:String(batch.nozzle ?? ''),machineLabel:batch.machine?.label || '',machineId:batch.machine?.id ?? null,
    manual:false,manualNumber:false};
}
function usedColourFabrics(rows,fabrics,shade) {
  const key=colourSelectionKey(shade),slots=reportFabricSlots(fabrics);
  return slots.filter(fabric=>rows.some(row=>colourSelectionKey(row.shade)===key && (fabricQuantity(row.quantities?.[fabric.key]) || 0)>0));
}
function findReportRowMachine(row,floor) {
  const label=String(row.machineLabel || '').trim();
  if (!label) return null;
  const candidates=getMachineSetup().filter(machine=>machineFloorsForMenu(floor).includes(normalizeFloor(machine.floor)) && String(machine.mcType).trim().toUpperCase()==='BULK' &&
    (String(machine.mcBrand ?? '').trim()+'-'+String(machine.mcNo ?? '').trim()).toLowerCase()===label.toLowerCase());
  return candidates.find(machine=>String(machine.id)===String(row.machineId)) || (candidates.length===1?candidates[0]:null);
}
function reportBatchAssignmentError(row,rows,fabrics,floor,context=null) {
  if (!String(row.machineLabel || '').trim()) return '';
  const machine=findReportRowMachine(row,floor);
  if (!machine) return 'Choose a unique Bulk machine from this floor’s Machine Selection Evaluation.';
  if (machine.available===false || machine.eligible===false) return 'This machine is unavailable for production.';
  const used=context?.used.get(String(row.id)) || machineFabricsWithComponents(usedColourFabrics([row],fabrics,row.shade).filter(fabric=>!fabric.componentKind),currentReportBooking(),floor,row.shade,rows,[row]);
  if (used.some(fabric=>!String(fabric.type).trim())) return 'Complete Fabric Info for every used fabric before assigning a machine.';
  if (!machineAllowsFabrics(machine,used)) return 'This machine is restricted for this colour’s fabric or GSM in Setup.';
  const mass=batchMass(row,context?.massIndex || buildComponentBatches(currentReportBooking(),floor,rows));
  if(mass.totalKg===null)return 'Supply BP Data Weight /Pcs for all together components before assigning a machine.';
  const quantity=mass.totalKg;
  if (!(quantity>0)) return 'Enter a positive fabric quantity before assigning a machine.';
  const config=erpMachineConfigurations(row.shade,floor,used).find(value=>String(value.id)===String(machine.id));
  if (!config) return 'This machine is not in the permitted floor pool.';
  try {
    const evaluated=GenericMachineSelection.selectMachine({totalQuantityKg:quantity,machines:[config],maximumLoadingPercent:BATCH_CALCULATION.defaultMaximumLoadingPercent});
    if (evaluated.selected.batches!==1) return 'This row exceeds the machine’s permitted loading. Reduce its quantities or use Load MC to split the colour.';
    row.loading=String(Number((quantity/config.capacityKg*100).toFixed(2)))+'%';row.nozzle=String(machineNozzles(config.capacityKg));
  } catch(error) {
    if (!(error instanceof GenericMachineSelection.MachineSelectionError)) throw error;
    return error.evaluations[0]?.remarks || error.message;
  }
  return '';
}
function sanitizeReportAssignments(rows,fabrics,floor) {
  const safe=copyReportData(rows),warnings=[];
  const sections=buildComponentBatches(currentReportBooking(),floor,safe),used=new Map(),byKey=new Map(fabrics.map(fabric=>[fabric.key,fabric]));
  for(const row of safe){const key=String(row.id);if(!used.has(key))used.set(key,new Set());for(const [fabricKey,qty] of Object.entries(row.quantities || {}))if(qty>0 && byKey.has(fabricKey) && !byKey.get(fabricKey).componentKind)used.get(key).add(byKey.get(fabricKey));}
  for(const section of sections)for(const row of section.rows){const key=String(row.id);if(!row.separate && used.has(key) && row.totalPcs>0)used.get(key).add({type:row.fabricType,gsm:'',componentKind:section.kind});}
  const context={massIndex:componentMassIndex(sections),used:new Map(Array.from(used,([key,fabrics])=>[key,Array.from(fabrics)]))};
  for (const row of safe) {
    const error=reportBatchAssignmentError(row,safe,fabrics,floor,context);
    if (!error) { row.assignmentError=''; continue; }
    warnings.push((row.id || row.shade || 'Batch')+': '+error+' Machine assignment cleared.');
    row.machineLabel='';row.machineId=null;row.loading='';row.nozzle='';row.assignmentError=error;
  }
  return {rows:safe,warnings};
}
function evaluateManualBatchRows(rows,fabrics,booking,floor) {
  const colours=new Map(),result=[];
  for (const row of rows) {
    if (!String(row.shade || '').trim()) continue;
    const key=row.selectionKey || (row.dyeingGroup?dyeingBatchGroupKey(row.shade,row.dyeingGroup):colourSelectionKey(row.shade));
    if (!colours.has(key)) colours.set(key,{shade:row.shade,dyeingGroup:row.dyeingGroup,componentAnchor:row.componentAnchor,selectionKey:key,groupLabel:(automaticTallBig(booking,floor)?(row.tallBig==='No'?'Regular':row.tallBig)+' · ':'')+(row.dyeingGroup==='peach'?'Peach':row.dyeingGroup?.startsWith('separate:')?'Separate fabric':row.dyeingGroup?'Non-peach':''),rows:[],quantities:{}});
    const group=colours.get(key);group.rows.push(row);
    for (const [fabricKey,value] of Object.entries(row.quantities || {})) group.quantities[fabricKey]=(group.quantities[fabricKey] || 0)+(fabricQuantity(value) || 0);
  }
  for (const group of colours.values()) {
    const sections=buildComponentBatches(booking,floor,rows),massIndex=componentMassIndex(sections),masses=group.rows.map(row=>batchMass(row,massIndex));
    const total=productionSum(masses.map(mass=>mass.totalKg ?? mass.bodyKg));
    if (!(total>0) || !floor) continue;
    const used=machineFabricsWithComponents(usedColourFabrics(group.rows,fabrics,group.shade).filter(fabric=>!fabric.componentKind),booking,floor,group.shade,rows,group.rows);
    const machines=erpMachineConfigurations(group.shade,floor,used);
    if(masses.some(mass=>mass.totalKg===null))machines.forEach(machine=>machine.rejectionReasons.push('BP Data Weight /Pcs is missing for together components.'));
    if (used.some(fabric=>!String(fabric.type).trim())) machines.forEach(machine=>machine.rejectionReasons.push('Fabric Info is missing for a used fabric.'));
    try {
      const evaluated=evaluateCombinedMachines({totalQuantityKg:total,bodyQuantityKg:productionSum(group.rows.map(row=>bodyBatchQuantity(row,fabrics))),machines,booking,floor,shade:group.shade,bodyRows:rows,dyeingGroup:group.dyeingGroup,componentAnchor:group.componentAnchor});
      const assigned=group.rows.filter(row=>row.machineLabel);
      const ids=new Set(assigned.map(row=>String(row.machineId)));
      const positive=group.rows.filter((row,index)=>masses[index].totalKg>0);
      evaluated.evaluations.forEach(row=>{row.applied=assigned.length===positive.length && ids.size===1 && ids.has(String(row.id));row.appliedBy='manual';});
      result.push({...group,rows:evaluated.evaluations,error:'',sourceRows:copyReportData(group.rows),totalQuantityKg:total});
    } catch(error) {
      if (!(error instanceof GenericMachineSelection.MachineSelectionError)) throw error;
      result.push({...group,rows:error.evaluations,error:error.message,sourceRows:copyReportData(group.rows),totalQuantityKg:total});
    }
  }
  return result;
}
function buildEditableReportTables(booking,floor) {
  const frozen=frozenConfirmedReport(booking,floor);
  if(frozen){
    currentFabricRows=copyReportData(frozen.fabrics);currentBatchRows=copyReportData(frozen.rows);currentReportMachineEvaluations=copyReportData(frozen.evaluations || []);currentReportBatchRowsTruncated=!!frozen.truncated;
    return {fabrics:currentFabricRows,rows:currentBatchRows,warnings:copyReportData(frozen.warnings || [])};
  }
  const manual=reportManualState(booking,floor);
  const automaticFabrics=extractDeduplicatedFabrics(booking.number,booking,floor);
  const fabrics=copyReportData(manual.fabricRows || automaticFabrics);
  // Older saved edits gain the new columns from their own source version.
  // Explicit manual values, including blanks, always take precedence.
  if(manual.fabricRows) {
    const sourceByKey=new Map(automaticFabrics.map(fabric=>[fabric.key,fabric]));
    for(const fabric of fabrics)for(const field of ['composition','greigeQty','ld','reference']) {
      if(fabric[field]===undefined)fabric[field]=sourceByKey.get(fabric.key)?.[field] ?? '';
    }
  }
  currentFabricRows=fabrics;
  let rows,warnings=[],evaluations=[];
  currentReportBatchRowsTruncated=false;
  if (manual.batchRows) {
    const sanitized=sanitizeReportAssignments(manual.batchRows,fabrics,floor);
    rows=sanitized.rows;warnings=sanitized.warnings;evaluations=evaluateManualBatchRows(rows,fabrics,booking,floor);
  } else {
    const automatic=generateColourBatches(booking,fabrics,floor);
    rows=automatic.batches.map(batch=>autoBatchRow(batch,fabrics));warnings=automatic.warnings;
    currentReportBatchRowsTruncated=automatic.evaluations.some(group=>group.rows.some(row=>row.applied && row.batches>BATCH_CALCULATION.maxRenderedBatches));
    evaluations=automatic.evaluations.map(group=>{
      const sourceRows=rows.filter(row=>machineEvaluationKey(row)===machineEvaluationKey(group));
      const quantities={};for(const row of sourceRows)for(const [key,qty] of Object.entries(row.quantities))quantities[key]=(quantities[key] || 0)+qty;
      return {...group,sourceRows:copyReportData(sourceRows),quantities,totalQuantityKg:group.totalQuantityKg ?? productionSum(Object.values(quantities))};
    });
    if (!rows.length && booking.batches?.length && booking.status!=='Pending') rows=booking.batches.map((batch,index)=>({rowKey:'legacy:'+index,id:batch.id,shade:batch.shade,ld:batch.ld,reference:batch.reference || '',quantities:Object.fromEntries(reportFabricSlots(fabrics).map((f,i)=>[f.key,fabricQuantity(batch.fabrics?.[i]) || 0])),loading:batch.loading || '',nozzle:String(batch.nozzle ?? ''),machineLabel:batch.machine || '',machineId:null,manual:false,manualNumber:false}));
  }
  if(!manual.batchRows && !getReportKnittingRows(booking.number,floor).length && rows.length){const safe=sanitizeReportAssignments(rows,fabrics,floor);rows=safe.rows;warnings.push(...safe.warnings);evaluations=evaluateManualBatchRows(rows,fabrics,booking,floor);}
  currentFabricRows=fabrics;currentBatchRows=rows;currentReportMachineEvaluations=evaluations;
  const components=buildComponentBatches(booking,floor,rows),massIndex=componentMassIndex(components);
  for(const row of rows)Object.assign(row,batchMass(row,massIndex));
  // Source/manual component changes cannot leave an overloaded machine assigned.
  if(!manual.batchRows) {
    const safe=sanitizeReportAssignments(rows,fabrics,floor);rows=safe.rows;warnings.push(...safe.warnings);currentBatchRows=rows;
    evaluations.forEach(group=>group.rows.forEach(config=>{if(config.applied && !rows.some(row=>machineEvaluationKey(row)===machineEvaluationKey(group) && String(row.machineId)===String(config.id)))config.applied=false;}));
  }
  return {fabrics,rows,warnings};
}
function rowEditingFields(kind) {
  if(kind==='instruction' || kind.startsWith('component:'))return auxiliaryRowFields(kind);
  return kind==='fabric'?FABRIC_ROW_FIELDS:[['id','Batch #'],...(tallBigEnabled()?[['tallBig','Tall/Big size']]:[]),['shade','Shade'],...(odColumn('body')?[['odColour','OD Colour']]:[]),['ld','Lapdip Number'],['reference','Reference'],
    ...reportFabricSlots().map(fabric=>['qty:'+fabric.key,fabric.name]),
    ['totalKg','Total batch Qty (kg)'],...(showKnittingReadiness()?[['knitStatus','Knit Status']]:[]),['loading','Loading'],['nozzle','M/C nozzle'],['machineLabel','MC Number']];
}
function rowInputHtml(field,label,value) {
  if(field==='tallBig')return `<select class="tall-big-select" data-row-field="tallBig" aria-label="${esc(label)}" required ${automaticTallBig()?'disabled':''}><option value="" ${!['No','Tall','Big'].includes(value)?'selected':''}>Select…</option>${['No','Tall','Big'].map(type=>`<option value="${type}" ${value===type?'selected':''}>${type}</option>`).join('')}</select>`;
  return `<input type="text" class="report-row-input" data-row-field="${esc(field)}" value="${esc(value ?? '')}" aria-label="${esc(label)}" ${field==='machineLabel'?'list="reportMachineOptions"':''}>`;
}
function reportRowActions(kind,index,editing,manual) {
  if(confirmedReportLocked())return '<td class="report-row-actions"><span class="manual-row-label">Read-only</span></td>';
  if (editing) return `<td class="report-row-actions"><span class="row-edit-label">${reportRowEditor.isNew?'New row':'Editing row'}</span><button type="button" class="btn success" data-report-row-action="save" data-row-kind="${kind}">Save Row</button><button type="button" class="btn secondary" data-report-row-action="cancel" data-row-kind="${kind}">Cancel</button><button type="button" class="btn danger" data-report-row-action="delete" data-row-kind="${kind}" data-row-index="${index}">Delete</button>${reportRowEditor.error?`<div class="row-edit-error">${esc(reportRowEditor.error)}</div>`:''}</td>`;
  return `<td class="report-row-actions">${manual?'<span class="manual-row-label">Manual</span>':''}<button type="button" class="btn secondary" data-report-row-action="edit" data-row-kind="${kind}" data-row-index="${index}">Edit</button><button type="button" class="btn danger" data-report-row-action="delete" data-row-kind="${kind}" data-row-index="${index}">Delete</button></td>`;
}
function fabricInfoEditableTable(fabrics) {
  const rows=fabrics.map((fabric,index)=>{
    const editing=reportRowEditor?.kind==='fabric' && reportRowEditor.index===index && !reportRowEditor.isNew;
    return `<tr class="${editing?'report-row-editing':fabric.manual?'report-row-manual':''}">${FABRIC_ROW_FIELDS.map(([field,label])=>`<td>${editing?rowInputHtml(field,label,reportRowEditor.values[field]):(['name','gsm','type'].includes(field)?'<strong>'+esc(fabric[field] ?? '')+'</strong>':esc(field==='greigeQty'?oneDecimalQty(fabric[field]):fabric[field] ?? ''))}</td>`).join('')}${reportRowActions('fabric',index,editing,fabric.manual)}</tr>`;
  });
  if (reportRowEditor?.kind==='fabric' && reportRowEditor.isNew) rows.push(`<tr class="report-row-editing">${FABRIC_ROW_FIELDS.map(([field,label])=>`<td>${rowInputHtml(field,label,reportRowEditor.values[field])}</td>`).join('')}${reportRowActions('fabric',fabrics.length,true,true)}</tr>`);
  if (!rows.length) rows.push(`<tr><td colspan="${FABRIC_ROW_FIELDS.length+1}" class="placeholder-cell">No uploaded Knitting Plan fabric data for this booking. Use Add Row to enter it manually.</td></tr>`);
  return table([...FABRIC_ROW_FIELDS.map(([,label])=>label),'Action'],rows,'grid-table report-edit-table fabric-info-table');
}
function componentFabricDisplayQuantities(rows,fabrics,booking,floor,sections=buildComponentBatches(booking,floor,rows)) {
  const totals=new Map();
  for(const section of sections)for(const row of section.rows) {
    const type=colourSelectionKey(row.fabricType),sourceKey='component:'+section.kind+':'+type;
    const candidates=fabrics.filter(fabric=>fabric.componentKind===section.kind);
    const fabric=candidates.find(fabric=>fabric.key===sourceKey) || candidates.find(fabric=>colourSelectionKey(fabric.type)===type);
    if(!fabric)continue;
    const key=JSON.stringify([String(row.id),colourSelectionKey(row.shade),fabric.key]);
    const prior=totals.get(key);
    totals.set(key,row.totalKg===null || prior===null?null:productionSum([prior || 0,row.totalKg]));
  }
  return totals;
}
function colourBatchEditableTable(rows,warnings) {
  const fields=rowEditingFields('batch');
  // Component kg is displayed in its existing Fabric number. Display values
  // stay outside body quantities so loading and totals continue to count it once.
  const components=buildComponentBatches(currentReportBooking(),currentViewingFloor,rows);
  const componentQuantities=componentFabricDisplayQuantities(rows,currentFabricRows,currentReportBooking(),currentViewingFloor,components);
  const readiness=showKnittingReadiness()?evaluateKnittingReadiness(currentReportBooking(),currentViewingFloor,currentFabricRows,rows,components):null;
  const componentKeys=new Set(currentFabricRows.filter(fabric=>fabric.componentKind).map(fabric=>fabric.key));
  const htmlRows=rows.map((row,index)=>{
    const editing=reportRowEditor?.kind==='batch' && reportRowEditor.index===index && !reportRowEditor.isNew;
    return `<tr class="${editing?'report-row-editing':row.manual?'report-row-manual':''}">${fields.map(([field,label])=>{
      if(field==='tallBig')return `<td>${editing?rowInputHtml(field,label,reportRowEditor.values[field]):`<select class="tall-big-select" data-batch-tall-big="${index}" aria-label="Tall/Big size for batch ${esc(row.id)}" required ${(confirmedReportLocked() || automaticTallBig())?'disabled':''} title="${automaticTallBig()?'Automatically selected from declared quantities':''}"><option value="" ${!['No','Tall','Big'].includes(row.tallBig)?'selected':''}>Select…</option>${['No','Tall','Big'].map(type=>`<option value="${type}" ${row.tallBig===type?'selected':''}>${type}</option>`).join('')}</select>`}</td>`;
      const fabricKey=field.startsWith('qty:')?field.slice(4):null;
      if(field==='knitStatus')return '<td class="print-hide-knit">'+knittingBadge(readiness?.[index],true)+'</td>';
      const rawValue=fabricKey!==null?(componentKeys.has(fabricKey)?componentQuantities.get(JSON.stringify([String(row.id),colourSelectionKey(row.shade),fabricKey])):row.quantities?.[fabricKey]):row[field];
      const value=rawValue===null && isCalculatedBatchField(field)?'Weight missing':rawValue ?? '';
      const display=(field.startsWith('qty:') || field.startsWith('componentKg:') || field==='totalKg')?(value===0?'':typeof value==='number'?kgText(value):value):value;
      const knitCell=fabricKey && readiness?.[index]?.cells[fabricKey];
      const knitNote=knitCell && (knitCell.kind!=='cc' || rawValue===null || typeof rawValue==='number' && rawValue>0)?'<div class="fabric-knit-note">'+knittingBadge(knitCell)+'</div>':'';
      return `<td class="${field==='loading'?'loading-val':field==='machineLabel'?'mc-accent':''}">${editing && !isCalculatedBatchField(field)?rowInputHtml(field,label,reportRowEditor.values[field]):field==='shade'?'<strong>'+esc(display)+'</strong>':esc(display)}${knitNote}${field==='machineLabel' && row.assignmentError?`<div class="row-edit-error">Unassigned: ${esc(row.assignmentError)}</div>`:''}</td>`;
    }).join('')}${reportRowActions('batch',index,editing,row.manual)}</tr>`;
  });
  if (reportRowEditor?.kind==='batch' && reportRowEditor.isNew) htmlRows.push(`<tr class="report-row-editing">${fields.map(([field,label])=>`<td${field==='knitStatus'?' class="print-hide-knit"':''}>${isCalculatedBatchField(field)?'Auto':rowInputHtml(field,label,reportRowEditor.values[field])}</td>`).join('')}${reportRowActions('batch',rows.length,true,true)}</tr>`);
  if (!htmlRows.length) htmlRows.push(`<tr><td colspan="${fields.length+1}" class="placeholder-cell">No batch rows. Use Add Row to enter one manually.</td></tr>`);
  const note=warnings.length?`<div class="batch-calculation-note">${warnings.map(warning=>`<div>${esc(warning)}</div>`).join('')}</div>`:'';
  return table([...fields.map(([,label])=>label),'Action'],htmlRows,'grid-table report-edit-table').replace('<th>Knit Status</th>','<th class="print-hide-knit">Knit Status</th>')+(readiness?'<p class="knit-allocation-note">Knit Status uses the latest Knit Prod. for this order, floor, Color, FabricConstruction and GSM. Earlier listed batches reserve production first. CC production requires a separate check.</p>':'')+note;
}
function refreshEditableReport({keepMachinePopup=false}={}) {
  if (!currentViewingNumber) return;
  const top=$('reportContent').scrollTop;
  openBatchPlanReport(currentViewingNumber,{keepMachinePopup});
  $('reportContent').scrollTop=top;
}
function startReportRowEdit(kind,index,isNew=false) {
  if (!canEditReport() || !reportDraft) return;
  if(kind==='batch' && currentReportBatchRowsTruncated){toast('This report shows only part of the generated batches. Batch editing is unavailable until the complete plan fits the report row limit.');return;}
  if (reportRowEditor) { toast('Save or cancel the row currently being edited first.'); return; }
  const auxiliary=kind==='instruction' || kind.startsWith('component:');
  const source=auxiliary?auxiliarySourceRows(kind)[index]:kind==='fabric'?currentFabricRows[index]:currentBatchRows[index];
  if (!isNew && !source) return;
  const values={};for(const [field] of rowEditingFields(kind).filter(([field])=>!isCalculatedBatchField(field)))values[field]=isNew?'':String(field.startsWith('qty:')?source.quantities?.[field.slice(4)] ?? '':field.startsWith('weight:')?source.weights?.[field.slice(7)] ?? '':source[field] ?? '');
  if(isNew && kind==='instruction')values.serial=String(auxiliarySourceRows(kind).length+1);
  if(isNew && kind==='batch' && automaticTallBig())values.tallBig='No';
  if (isNew && kind==='fabric') values.name='Fabric '+(currentFabricRows.length+1);
  reportRowEditor={kind,index,isNew,values,error:''};
  refreshEditableReport();
  const first=$('reportContent').querySelector('.report-row-editing input');if(first)first.focus();
}
function writeDraftToBooking(master,index,newStatus,{internalApproval=false}={}) {
  const floor=reportDraft.floor,old=savedReportPlan(master[index],floor);
  if(confirmedReportLocked(master[index],floor))throw new Error('This confirmed plan is read-only until the latest data is reviewed from Need Re-Confirm List');
  if(reportBookingStatus(master[index],floor)==='Confirm' && reportDraft.dirty && !reportDraft.reviewLatest && !internalApproval)throw new Error('Approve staged edits using Internal change before saving this confirmed booking');
  if(newStatus==='Confirm'){const error=confirmGeneralInfoError(master[index],floor);if(error)throw new Error(error);}
  if(['Tentative','Confirm'].includes(newStatus)){const error=tallBigSaveError(master[index],floor);if(error)throw new Error(error);}
  const plan={...old,...(newStatus?{status:newStatus}:{})};
  plan.lastSaveAt = new Date().toISOString();
  if(old.confirmedSnapshot && !reportDraft.reviewLatest && (reportDraft.dirty || newStatus!==reportBookingStatus(master[index],floor))){plan.pmcCorrectionAt=plan.lastSaveAt;plan.pmcCorrectionBy=currentUsername();}
  if (newStatus==='Pending') { delete plan.machineSelections;delete plan.reportOverrides;delete plan.componentDyeingTypes;delete plan.componentSeparate;delete plan.fabricDyeingSeparate;delete plan.tallBigSettings; }
  else {
    plan.machineSelections=copyReportData(reportDraft.manual.machineSelections);
    plan.componentDyeingTypes=copyReportData(reportDraft.manual.componentTypes || {});
    plan.componentSeparate=copyReportData(reportDraft.manual.componentSeparate || {});
    plan.fabricDyeingSeparate=copyReportData(reportDraft.manual.fabricSeparate || {});
    plan.tallBigSettings=copyReportData(reportDraft.manual.tallBig || {enabled:false,declarations:{}});
    plan.reportOverrides={schemaVersion:1,generalInfo:copyReportData(reportDraft.manual.generalInfo || {}),odBP:copyReportData(reportDraft.manual.odBP || {}),fabricRows:copyReportData(reportDraft.manual.fabricRows),batchRows:copyReportData(reportDraft.manual.batchRows),componentRows:copyReportData(reportDraft.manual.componentRows || {}),instructions:copyReportData(reportDraft.manual.instructions ?? null)};
  }
  if(newStatus==='Confirm' && !plan.flatAllowanceSnapshot)plan.flatAllowanceSnapshot=copyReportData(getFlatAllowance());
  if(newStatus==='Confirm' && old.confirmedSnapshot && reportDraft.dirty && !reportDraft.reviewLatest)plan.confirmedSnapshot={...old.confirmedSnapshot,reportData:internalApproval && reportDraft.previewReport?copyReportData(reportDraft.previewReport):captureConfirmedReport(master[index],floor)};
  if (newStatus==='Confirm' && !plan.batchDate) plan.batchDate=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'});
  master[index]=floor?{...master[index],floorPlans:{...(master[index].floorPlans || {}),[floor]:plan}}:{...master[index],...plan};
  if (!floor && newStatus==='Pending') {delete master[index].machineSelections;delete master[index].reportOverrides;delete master[index].componentDyeingTypes;delete master[index].componentSeparate;delete master[index].fabricDyeingSeparate;delete master[index].tallBigSettings;}
}
async function retainSavedReportDraft() {
  const booking=currentReportBooking();
  if (!booking || !reportDraft || reportDraft.reviewLatest) return false;
  if(reportBookingStatus(booking,reportDraft.floor)==='Confirm'){reportDraft.previewReport=captureConfirmedReport(booking,reportDraft.floor);return false;}
  if (reportBookingStatus(booking,reportDraft.floor)!=='Tentative') return false;
  if(tallBigSaveError(booking,reportDraft.floor))return false;
  const activeDraft=reportDraft;
  const master=getStoredMasterList().slice(),index=master.findIndex(row=>row.number===reportDraft.number);
  if (index<0) return false;
  writeDraftToBooking(master,index,reportBookingStatus(booking,reportDraft.floor));
  await saveMasterList(master);
  if(reportDraft===activeDraft)reportDraft.dirty=false;
  return true;
}
async function saveReportRow() {
  if (!reportRowEditor || !reportDraft || !canEditReport()) return false;
  if(reportRowEditor.kind==='instruction' || reportRowEditor.kind.startsWith('component:'))return saveAuxiliaryReportRow();
  const editor=copyReportData(reportRowEditor),before=copyReportData(reportDraft);
  $('reportContent').querySelectorAll('.report-row-editing [data-row-field]').forEach(input=>editor.values[input.dataset.rowField]=input.value);
  const rows=copyReportData(editor.kind==='fabric'?currentFabricRows:currentBatchRows);
  const source=editor.isNew?{}:rows[editor.index];
  let row;
  if(editor.kind==='fabric') {
    row={...source,...editor.values,key:source.key || 'manual-fabric:'+Date.now()+':'+Math.random().toString(36).slice(2),name:source.name || 'Fabric '+(currentFabricRows.length+1),manual:true};
    if(!row.componentKind && String(row.greigeQty || '').trim() && (fabricQuantity(row.greigeQty)===null || fabricQuantity(row.greigeQty)<0)){reportRowEditor={...editor,error:'Greige Qty must be a non-negative number.'};refreshEditableReport();return false;}
  } else {
    row={...source,quantities:{...(source.quantities || {})},manual:true,rowKey:source.rowKey || 'manual:'+Date.now()+':'+Math.random().toString(36).slice(2)};
    for(const [field,value] of Object.entries(editor.values)) {
      if(field.startsWith('qty:')) {
        const quantity=String(value).trim()===''?0:fabricQuantity(value);
        if(quantity===null || quantity<0) {reportRowEditor.values=editor.values;reportRowEditor.error='Fabric quantities must be non-negative numbers.';refreshEditableReport();return false;}
        row.quantities[field.slice(4)]=quantity;
      } else if(!isCalculatedBatchField(field))row[field]=value;
    }
    if(!String(row.id || '').trim() || !String(row.shade || '').trim()) {reportRowEditor.values=editor.values;reportRowEditor.error='Enter a batch number and colour.';refreshEditableReport();return false;}
    if(rows.some((other,index)=>index!==editor.index && String(other.id).trim()===String(row.id).trim())) {reportRowEditor.values=editor.values;reportRowEditor.error='This batch number is already used by another row.';refreshEditableReport();return false;}
    row.manualNumber=editor.isNew || source.manualNumber || row.id!==source.id;
  }
  if(editor.isNew)rows.push(row);else rows[editor.index]=row;
  if(editor.kind==='batch') {
    if(tallBigEnabled() && !['No','Tall','Big'].includes(row.tallBig)){reportRowEditor={...editor,error:'Select No, Tall or Big for this batch.'};refreshEditableReport();return false;}
    const error=reportBatchAssignmentError(row,rows,currentFabricRows,reportDraft.floor);
    if(error) {reportRowEditor.values=editor.values;reportRowEditor.error=error;refreshEditableReport();return false;}
    const machine=findReportRowMachine(row,reportDraft.floor);row.machineId=machine?.id ?? null;
    preserveTallBigBatchEdits();reportDraft.manual.batchRows=rows;syncBodyTallBigQuantities(rows);
  } else {
    preserveTallBigBatchEdits();reportDraft.manual.fabricRows=rows;
    if(reportDraft.manual.batchRows) reportDraft.manual.batchRows=sanitizeReportAssignments(reportDraft.manual.batchRows,rows,reportDraft.floor).rows;
  }
  reportDraft.dirty=true;
  setMutationBusy(true);
  try {
    const retained=await retainSavedReportDraft();
    reportRowEditor=null;
    refreshEditableReport();
    toast(retained?'Row saved to the booking.':'Row staged. '+reportSaveHint());
    return true;
  } catch(error) {
    if(currentViewingNumber===before.number && currentViewingFloor===before.floor){reportDraft=before;reportRowEditor={...editor,error:'Could not save. Your entered values remain available for retry.'};refreshEditableReport();}
    showSaveError(error);return false;
  } finally {setMutationBusy(false);}
}
function renumberReportBatches(rows,bookingNumber) {
  const used=new Set(rows.filter(row=>row.manualNumber && row.id).map(row=>String(row.id)));
  let sequence=1;
  for(const row of rows) {
    if(row.manualNumber && row.id)continue;
    let id;do{id=normalizeBookingKey(bookingNumber)+String(sequence++).padStart(3,'0');}while(used.has(id));
    row.id=id;used.add(id);
  }
}
function regroupManualDyeingRows(rows,fabrics,booking,floor) {
  preserveTallBigBatchEdits();
  const result=[],colours=new Map();
  for(const row of rows) {
    const key=colourSelectionKey(row.shade);
    if(!colours.has(key))colours.set(key,{shade:row.shade,rows:[]});
    if(row.dyeingGroup==='components' && !row.manual)continue;
    const colour={shade:row.shade,groups:new Map()};
    fabrics.forEach((fabric,index)=>{const qty=fabricQuantity(row.quantities?.[fabric.key]) || 0;if(fabric.componentKind || qty<=0)return;
      const source=getReportKnittingRows(booking.number,floor).filter(item=>rowFabricKey(item)===fabric.key && colourSelectionKey(firstUploadedValue(item,BATCH_CALCULATION.colorHeaders))===key);
      const finishes=new Set(source.map(item=>hasPeachFinish(item._fabricColumns?.peach)));
      const peach=!fabric.manual && finishes.size>1 && typeof row.peachFinish==='boolean'?row.peachFinish:fabricPeachForColour(fabric,row.shade,booking,floor);
      addDyeingGroupQuantity(colour,fabrics,index,qty,peach,booking,floor);
    });
    if(!colour.groups.size){const emptyKey=row.dyeingGroup==='components'?'components':'together';colour.groups.set(emptyKey,{key:emptyKey,peach:false,quantities:Array(fabrics.length).fill(0)});}
    // Preserve each manually saved row's quantities, number and other fields.
    // Only split a row when its fabrics now belong to different dyeing groups.
    const groups=Array.from(colour.groups.values()).sort((a,b)=>(a.key==='together'?-2:a.key==='peach'?-1:0)-(b.key==='together'?-2:b.key==='peach'?-1:0));
    groups.forEach((group,index)=>{
      const split={...copyReportData(row),id:index?'':row.id,rowKey:index?'split:'+row.rowKey+':'+group.key:row.rowKey,manualNumber:index?false:!!row.manualNumber,
        dyeingGroup:group.key,peachFinish:group.peach,quantities:Object.fromEntries(fabrics.map((fabric,i)=>[fabric.key,group.quantities[i]])),manual:true};
      result.push(split);colours.get(key).rows.push(split);
    });
  }
  const components=componentColourSummary(booking,floor,Array.from(colours.values()).map(colour=>colour.shade));
  for(const [key,colour] of colours) {
    const groupKeys=new Set(colour.rows.map(row=>row.dyeingGroup)),anchor=groupKeys.has('together')?'together':groupKeys.has('peach')?'peach':groupKeys.has('components')?'components':null;
    const together=components.get(key);
    if(!anchor && (together?.kg>0 || together?.missing)) {
      const seed={shade:colour.shade,groups:new Map([['components',{key:'components',label:'Together components',peach:false,quantities:Array(fabrics.length).fill(0)}]]),ld:new Map(),reference:new Map(),invalid:false};
      const added=createDyeingBatches(booking,fabrics,floor,new Map([[key,seed]])).batches.map((batch,index)=>({...autoBatchRow(batch,fabrics),rowKey:'components:'+key+':'+index,id:'',manual:false}));
      result.push(...added);colour.rows.push(...added);groupKeys.add('components');
    }
    for(const row of colour.rows){row.componentAnchor=row.dyeingGroup===(anchor || 'components');row.selectionKey=groupKeys.size===1?key:dyeingBatchGroupKey(colour.shade,row.dyeingGroup);}
  }
  orderDyeingModeBatches(result,fabrics,booking,floor);
  renumberReportBatches(result,booking.number);return result;
}
function applyMachineToManualBatchRows(group,configuration) {
  if(!reportDraft.manual.batchRows)return;
  preserveTallBigBatchEdits();
  const rows=copyReportData(currentBatchRows),key=machineEvaluationKey(group),source=rows.filter(row=>machineEvaluationKey(row)===key);
  const quantityTotals={};for(const row of source)for(const [fabricKey,quantity] of Object.entries(row.quantities || {}))quantityTotals[fabricKey]=(quantityTotals[fabricKey] || 0)+(fabricQuantity(quantity) || 0);
  const replacement=Array.from({length:Math.min(configuration.batches,BATCH_CALCULATION.maxRenderedBatches)},(_,index)=>({
    rowKey:'loaded:'+key+':'+index,id:source[index]?.manualNumber?source[index].id:'',manualNumber:!!source[index]?.manualNumber,
    dyeingGroup:group.dyeingGroup,componentAnchor:group.componentAnchor,selectionKey:key,peachFinish:source[0]?.peachFinish,
    tallBig:source[index]?.tallBig || (automaticTallBig()?source[0]?.tallBig:'') || '',
    shade:group.shade,ld:source[index]?.ld ?? source[0]?.ld ?? '',reference:source[index]?.reference ?? source[0]?.reference ?? '',
    quantities:Object.fromEntries(Object.entries(quantityTotals).map(([fabricKey,quantity])=>[fabricKey,quantity/configuration.batches])),
    loading:String(Number(configuration.actualLoadingPercent.toFixed(2)))+'%',nozzle:String(machineNozzles(configuration.capacityKg)),
    machineId:configuration.id,machineLabel:configuration.machine.label,manual:true
  }));
  const first=rows.findIndex(row=>machineEvaluationKey(row)===key),remaining=rows.filter(row=>machineEvaluationKey(row)!==key);
  remaining.splice(first<0?remaining.length:first,0,...replacement);
  orderDyeingModeBatches(remaining,currentFabricRows,currentReportBooking(),reportDraft.floor);
  renumberReportBatches(remaining,reportDraft.number);
  reportDraft.manual.batchRows=remaining;
}
function tentativeReasons(answers) {
  if (!answers) return [];
  const reasons = [];
  for(const [field,question] of [['labDip','Is the lab dip approved?'],['bookingHold','Is the booking on hold?'],['productionConfirmed','Is final production confirmation completed?']]) {
    if(['Yes','No'].includes(answers[field]))reasons.push(question+' '+answers[field]);
  }
  if (String(answers.others || '').trim()) reasons.push('And Also: ' + String(answers.others).trim());
  return reasons;
}
function reportManualNotice(booking,floor) {
  const status = reportBookingStatus(booking,floor), retained=['Tentative','Confirm'].includes(status);
  if(confirmedReportLocked(booking,floor))return '<div class="confirmed-readonly-notice"><strong>Confirmed plan is read-only.</strong> This order is in Need Re-Confirm List. Open it from that list to review and re-confirm the latest data.</div>';
  if(status==='Confirm' && !reviewingLatest(booking.number,floor))return `<div class="${reportDraft?.dirty?'internal-change-notice':'manual-report-notice'}">${reportDraft?.dirty?'<strong>Internal changes pending approval.</strong> ':''}Save Row stages edits. Use <strong>Internal change</strong> to approve them; No discards the edits and returns to Confirm List.</div>`;
  if(reviewingLatest(booking.number,floor))return `<div class="reconfirm-review-notice"><strong>Reviewing latest uploaded plan.</strong> Confirmed BP Revised No: ${esc(revisionDisplay(savedReportPlan(booking,floor).confirmedSnapshot?.revisionNo))} · Latest YB Revised No: ${esc(revisionDisplay(revisionNumberFromRows(getReportKnittingRows(booking.number,floor))))}. The previous confirmed plan stays saved until you click Re-Confirm Latest Plan. Row saves and machine choices here stay in this review draft.</div>`;
  const reasons = status==='Tentative' ? tentativeReasons(savedReportPlan(booking,floor).tentativeAnswers) : [];
  const edit = status==='Tentative' ? '<button type="button" class="btn secondary tentative-edit-answers" data-edit-tentative>Edit Tentative Answers</button>' : '';
  if (reasons.length) {
    const summary=reasons.join('; ');
    return `<div class="tentative-reason-notice"><strong>Why is it tentative?</strong> <span>${esc(summary)}${/[.!?]$/.test(summary)?'':'.'}</span>${edit}</div>`;
  }
  return `<div class="manual-report-notice">${retained?'Saved booking: manual row saves and machine choices are retained.':'Draft: Save Row stages changes. Save the booking as Tentative or Confirmed to retain them. Returning to the list discards unsaved manual changes.'}${edit}</div>`;
}
$('reportContent').addEventListener('input',event=>{
  const input=event.target.closest('[data-row-field]');if(input && reportRowEditor)reportRowEditor.values[input.dataset.rowField]=input.value;
});
$('reportContent').addEventListener('click',event=>{
  if(event.target.closest('[data-edit-tentative]')){openTentativeQuestionnaire();return;}
  const button=event.target.closest('[data-report-row-action]');if(!button)return;
  const action=button.dataset.reportRowAction,kind=button.dataset.rowKind;
  if(action==='delete'){deleteReportRow(kind,Number(button.dataset.rowIndex));return;}
  if(action==='edit')startReportRowEdit(kind,Number(button.dataset.rowIndex));
  if(action==='add')startReportRowEdit(kind,kind==='fabric'?currentFabricRows.length:currentBatchRows.length,true);
  if(action==='save')saveReportRow();
  if(action==='cancel'){reportRowEditor=null;refreshEditableReport();}
});


let currentComponentSections=[];
function instructionRows(booking,floor) {
  const frozen=frozenConfirmedReport(booking,floor);if(frozen)return copyReportData(frozen.instructions || []);
  const manual=reportManualState(booking,floor),source=manual.instructions ?? booking.instructions ?? [];
  return copyReportData(source.map((value,index)=>typeof value==='object' ? {serial:String(value.serial ?? index+1),details:String(value.details ?? '')} : {serial:String(index+1),details:String(value)}));
}
function auxiliaryRowFields(kind) {
  if(kind==='instruction')return [['serial','SL No'],['details','Details']];
  const section=currentComponentSections.find(section=>section.kind===kind.slice(10));
  return [['id','Batch #'],...(tallBigEnabled() && tallBigSettings().declarations?.[section?.kind]?.enabled?[['tallBig','Tall/Big size']]:[]),['shade','Color'],...(odColumn(section?.kind)?[['odColour','OD Colour']]:[]),...(section?.dyeingType==='YD'?[['tippingColour','Tipping Colour']]:[]),['fabricType','FabricType'],['ld','Lapdip Number'],['reference','Reference'],...(section?.sizes || []).map(size=>['qty:'+size.key,size.label+' (pcs)']),['newSize','Add Size (L x W)'],['newSizeQty','New Size Qty (pcs)'],['newSizeWeight','New Size Weight (kg/pc)']];
}
function auxiliarySourceRows(kind) {
  return kind==='instruction' ? instructionRows(getFloorBooking(currentReportBooking(),currentViewingFloor),currentViewingFloor) : currentComponentSections.find(section=>section.kind===kind.slice(10))?.rows || [];
}
function editableInstructionTable(booking,floor) {
  const rows=instructionRows(booking,floor),kind='instruction';
  const render=(row,index,isNew=false)=>{
    const editing=reportRowEditor?.kind===kind && reportRowEditor.index===index && (isNew || !reportRowEditor.isNew);
    return `<tr class="${editing?'report-row-editing':''}">${auxiliaryRowFields(kind).map(([field,label])=>`<td>${editing ? field==='serial' ? `<input class="report-row-input" data-row-field="serial" aria-label="SL No" value="${esc(reportRowEditor.values.serial)}" style="width:${Math.max(2,String(reportRowEditor.values.serial).length)}ch">` : `<textarea class="report-row-input" data-row-field="details" aria-label="Details" rows="2">${esc(reportRowEditor.values.details)}</textarea>` : esc(row[field])}</td>`).join('')}${reportRowActions(kind,index,editing,false)}</tr>`;
  };
  const html=rows.map((row,index)=>render(row,index));
  if(reportRowEditor?.kind===kind && reportRowEditor.isNew)html.push(render({},rows.length,true));
  if(!html.length)html.push('<tr><td colspan="3" class="placeholder-cell">No instructions. Use Add Row to enter one.</td></tr>');
  return table(['SL No','Details','Action'],html,'grid-table report-edit-table instruction-table');
}
function overlayComponentRows(section,booking,floor) {
  const manual=reportManualState(booking,floor).componentRows?.[section.kind];
  if(!manual)return;
  section.rows=copyReportData(manual);section.manual=true;
  const sizes=new Map(section.sizes.map(size=>[size.key,size]));
  for(const row of section.rows)for(const key of Object.keys(row.quantities || {})){if(!sizes.has(key)){const size=componentSize({CCSize:key});if(size)sizes.set(size.key,size);}}
  section.sizes=Array.from(sizes.values()).sort(compareComponentSizes);
}
function componentEditableTable(section) {
  const kind='component:'+section.kind,editorHere=reportRowEditor?.kind===kind;
  const fields=auxiliaryRowFields(kind).filter(([field])=>editorHere || !['newSize','newSizeQty','newSizeWeight'].includes(field));
  const render=(row,index,isNew=false)=>{
    const editing=editorHere && reportRowEditor.index===index && (isNew || !reportRowEditor.isNew);
    const cells=fields.map(([field,label])=>{
      if(field==='tallBig'){const body=currentBatchRows.find(batch=>batch.id===(row.bodyBatchId || row.id) && colourSelectionKey(batch.shade)===colourSelectionKey(row.shade));return '<td>'+esc(row.tallBig || body?.tallBig || 'No')+'</td>';}
      const value=field.startsWith('qty:')?row.quantities?.[field.slice(4)] ?? 0:row[field] ?? '';
      const weightField=field.startsWith('qty:')?'weight:'+field.slice(4):null;
      const weightInput=editing && weightField?`<label class="component-weight-input">kg/pc ${rowInputHtml(weightField,'Weight /Pcs for '+label,reportRowEditor.values[weightField] ?? row.weights?.[field.slice(4)] ?? '')}</label>`:'';
      return `<td>${editing?rowInputHtml(field,label,reportRowEditor.values[field]):esc(value)}${weightInput}</td>`;
    }).join('');
    return `<tr class="${editing?'report-row-editing':section.manual?'report-row-manual':''}">${cells}<td>${editing?'Auto':esc(row.totalPcs ?? 0)}</td><td title="${esc(row.totalKg ?? 'Weight /Pcs is missing')}">${editing?'Auto':row.totalKg===null?'Weight missing':esc(kgText(row.totalKg || 0))}</td>${reportRowActions(kind,index,editing,section.manual)}</tr>`;
  };
  const rows=section.rows.map((row,index)=>render(row,index));
  if(editorHere && reportRowEditor.isNew)rows.push(render({},section.rows.length,true));
  if(!rows.length)rows.push(`<tr><td colspan="${fields.length+3}" class="placeholder-cell">No component batches could be allocated. Review BP Data, or use Add Row.</td></tr>`);
  if(section.rows.length){const totals=section.sizes.map(size=>productionSum(section.rows.map(row=>row.quantities[size.key] || 0))),kg=section.rows.some(row=>row.totalKg===null)?null:productionSum(section.rows.map(row=>row.totalKg));rows.push('<tr class="component-total"><td colspan="'+(5+(fields.some(([field])=>field==='odColour')?1:0)+(fields.some(([field])=>field==='tallBig')?1:0)+(fields.some(([field])=>field==='tippingColour')?1:0))+'">Allocated pieces</td>'+totals.map(qty=>'<td>'+esc(qty)+'</td>').join('')+(editorHere?'<td></td><td></td><td></td>':'')+'<td>'+esc(productionSum(totals))+'</td><td>'+(kg===null?'Weight missing':esc(kgText(kg)))+'</td><td class="report-row-actions"></td></tr>');}
  return table([...fields.map(([,label])=>label),'Total Qty (pcs)','Total Qty (kg)','Action'],rows,'grid-table report-edit-table');
}

async function saveAuxiliaryReportRow() {
  if(!reportRowEditor || !reportDraft || !canEditReport())return false;
  const editor=copyReportData(reportRowEditor),before=copyReportData(reportDraft);
  $('reportContent').querySelectorAll('.report-row-editing [data-row-field]').forEach(input=>editor.values[input.dataset.rowField]=input.value);
  const rows=copyReportData(auxiliarySourceRows(editor.kind)),old=editor.isNew?{}:rows[editor.index];let row,error='';
  if(editor.kind==='instruction') {
    row={serial:String(editor.values.serial || '').trim(),details:String(editor.values.details || '').trim()};
    if(!row.serial || !row.details)error='Enter a serial number and instruction.';
  } else {
    row={...old,id:String(editor.values.id || '').trim(),shade:String(editor.values.shade || '').trim(),fabricType:String(editor.values.fabricType || '').trim(),odColour:String(editor.values.odColour ?? old.odColour ?? '').trim(),tippingColour:String(editor.values.tippingColour ?? old.tippingColour ?? '').trim(),ld:editor.values.ld || '',reference:editor.values.reference || '',quantities:{},weights:{...(old.weights || {})},manual:true};
    for(const [key,value] of Object.entries(editor.values))if(key.startsWith('qty:')){const qty=String(value).trim()===''?0:fabricQuantity(value);if(qty===null || !Number.isSafeInteger(qty) || qty<0)error='Size quantities must be non-negative whole pieces.';else row.quantities[key.slice(4)]=qty;}
    for(const [key,value] of Object.entries(editor.values))if(key.startsWith('weight:')){const weight=String(value).trim()===''?null:fabricQuantity(value);if(weight!==null && weight<0)error='Weight per piece must be a non-negative kg value.';else row.weights[key.slice(7)]=weight;}
    const newSize=String(editor.values.newSize || '').trim(),newQty=String(editor.values.newSizeQty || '').trim();
    if(newSize || newQty){const size=componentSize({CCSize:newSize}),qty=fabricQuantity(newQty);if(!size?.numeric || qty===null || !Number.isSafeInteger(qty) || qty<0)error='Enter the new size as length x width and a non-negative whole-piece quantity.';else {row.quantities[size.key]=qty;const weight=String(editor.values.newSizeWeight || '').trim()===''?null:fabricQuantity(editor.values.newSizeWeight);if(weight!==null && weight<0)error='Weight per piece must be a non-negative kg value.';row.weights[size.key]=weight;}}
    if(!row.id || !row.shade || !row.fabricType)error='Enter Batch #, Color and FabricType.';
    if(!Object.values(row.quantities).some(qty=>qty>0))error='Enter a positive planned quantity for at least one size.';
    if(rows.some((other,index)=>index!==editor.index && other.id===row.id && colourSelectionKey(other.shade)===colourSelectionKey(row.shade) && other.fabricType.toLowerCase()===row.fabricType.toLowerCase()))error='This batch, colour and FabricType already exist in this section.';
    const existing=[...currentBatchRows,...currentComponentSections.flatMap(section=>section.rows)];
    if(existing.some(other=>other.id===row.id && colourSelectionKey(other.shade)!==colourSelectionKey(row.shade)))error='A batch number cannot belong to two different colours.';
  }
  if(error){reportRowEditor={...editor,error};refreshEditableReport();return false;}
  if(editor.isNew)rows.push(row);else rows[editor.index]=row;
  if(editor.kind==='instruction')reportDraft.manual.instructions=rows;
  else {reportDraft.manual.componentRows={...(reportDraft.manual.componentRows || {}),[editor.kind.slice(10)]:rows};syncTallBigManualComponentRows(editor.kind.slice(10),rows);}
  reportDraft.dirty=true;setMutationBusy(true);
  try {
    const retained=await retainSavedReportDraft();reportRowEditor=null;refreshEditableReport();
    toast(retained?'Row saved to the booking.':'Row staged. '+reportSaveHint());return true;
  }catch(error){reportDraft=before;reportRowEditor={...editor,error:'Could not save. Your entered values remain available for retry.'};refreshEditableReport();showSaveError(error);return false;}finally{setMutationBusy(false);}
}


/* BP components share the colour batch count. Together weights are included
   in the input to the unchanged generic selection formula. */
const BP_DATA_HEADERS = {
  order:['OrderNo','Order No','Booking No','Booking Number'],
  colour:['Color','Colour','Shade','Color Name','Colour Name'],
  details:['FabricDetails','Fabric Details','Fabric Description'],
  fabricType:['FabricType','Fabric Type'],
  quantity:['RequiredQtyPCs','Required Qty PCs','Required Qty (Pcs)','Required Quantity PCs','Qty PCs'],
  quantityKg:['RequiredQtyKgs','Required Qty Kgs','Required Qty (Kgs)','Required Quantity Kg','RequiredQtyKg'],
  weight:['Weight /Pcs','Weight/Pcs','Weight Per Pcs','Weight Per Piece','WeightPerPcs','Kg / Pcs','Kg Per Piece'],
  size:['CCSize','Size','FabricSize','Fabric Size','Size Details','SizeDetails','Size Name','SizeName','Finish Size','Finished Size','Size (Length x Width)','Length x Width','Size (Inch)','Size (Inches)'],
  length:['Length','Fabric Length','Length Inch','Length Inches'],
  width:['Width','Fabric Width','Width Inch','Width Inches'],
  floor:['Dyeing Floor','DyeingFloor','Floor']
};
function bpValue(row,field) {
  const values=new Map(Object.entries(row).filter(([,value])=>value!==null && value!==undefined && String(value).trim()!=='').map(([key,value])=>[knittingInfoHeaderKey(key),value]));
  for(const header of BP_DATA_HEADERS[field] || [])if(values.has(knittingInfoHeaderKey(header)))return values.get(knittingInfoHeaderKey(header));
  return '';
}
let indexedBpData=null;
let bpBookingIndex=new Map();
function getBpRows(number,floor=null,knittingRows=null,additionalColours=null) {
  const dataset=getStoredDatasets().bpData || null;
  if(indexedBpData!==dataset){
    indexedBpData=dataset;bpBookingIndex=new Map();
    for(const [key,rows] of Object.entries(dataset || {})) {
      const normalized=normalizeBookingKey(key);
      if(!bpBookingIndex.has(normalized))bpBookingIndex.set(normalized,[]);
      for(const row of rows)bpBookingIndex.get(normalized).push(row);
    }
  }
  const rows=bpBookingIndex.get(normalizeBookingKey(number)) || [];
  if(!floor)return rows;
  const manualColours=additionalColours || (sourceBooking(number) && savedReportPlan(sourceBooking(number),floor).reportOverrides?.batchRows || []).map(row=>row.shade);
  const colours=new Set([...(knittingRows || getKnittingRows(number,floor)).map(row=>colourSelectionKey(firstUploadedValue(row,BATCH_CALCULATION.colorHeaders))),...manualColours.map(colourSelectionKey)]);
  return rows.filter(row=>{
    const assignedFloor=normalizeFloor(bpValue(row,'floor'));
    if(assignedFloor)return assignedFloor===floor;
    const colour=colourSelectionKey(bpValue(row,'colour'));
    return !colour || colours.has(colour);
  });
}
function getReportBpRows(booking,floor,additionalColours=[]) {
  if(confirmedCaptureContext?.booking.number===booking.number && confirmedCaptureContext.floor===floor){const snapshot=savedReportPlan(confirmedCaptureContext.booking,floor).confirmedSnapshot;if(snapshot)return confirmedBpSnapshotRows(snapshot);}
  if(reviewingLatest(booking.number,floor) && reportDraft?.reviewLatest)return reportDraft.reviewBpRows;
  const plan=savedReportPlan(booking,floor);
  if(reportBookingStatus(booking,floor)==='Confirm' && plan.confirmedSnapshot?.bpSourceRows!==undefined)return confirmedBpSnapshotRows(plan.confirmedSnapshot);
  return getBpRows(booking.number,floor,getReportKnittingRows(booking.number,floor),[...(reportManualState(booking,floor).batchRows || []).map(row=>row.shade),...additionalColours]);
}
const COMPONENT_KINDS=[['collar','Collar'],['cuff','Cuff'],['hem','Hem'],['placket','Placket']];
function componentKinds(details) {
  return COMPONENT_KINDS.filter(([key])=>new RegExp(key,'i').test(String(details))).map(([key])=>key);
}
function componentDimension(value) {
  const text=String(value).trim().replace(/(?:inches|inch|in|cm|mm|["“”″'])\s*$/i,'').trim();
  const mixed=text.match(/^(\d+(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?$/);
  if(mixed && (!mixed[3] || Number(mixed[3])>0))return Number(mixed[1])+(mixed[2]?Number(mixed[2])/Number(mixed[3]):0);
  const fraction=text.match(/^(\d+)\/(\d+)$/);
  return fraction && Number(fraction[2])>0 ? Number(fraction[1])/Number(fraction[2]) : null;
}
function componentSize(row) {
  let raw=String(bpValue(row,'size')).trim();
  if(!raw){const length=bpValue(row,'length'),width=bpValue(row,'width');if(length!=='' && width!=='')raw=length+' x '+width;}
  if(!raw)return null;
  const parts=raw.split(/\s*[x×*]\s*/i),length=parts.length===2?componentDimension(parts[0]):null,width=parts.length===2?componentDimension(parts[1]):null;
  const numeric=length!==null && width!==null && Number.isFinite(length) && Number.isFinite(width) && length>0 && width>0;
  const label=numeric ? length+' x '+width : raw.replace(/\s+/g,' ');
  return {key:label.toLowerCase(),label,length:numeric?length:Infinity,width:numeric?width:Infinity,numeric};
}
function compareComponentSizes(a,b) { return a.length-b.length || a.width-b.width || a.label.localeCompare(b.label,undefined,{numeric:true}); }
function componentDyeingType(booking,floor,kind) { return reportManualState(booking,floor).componentTypes?.[kind]==='YD' ? 'YD' : 'Solid'; }
function componentBatchAllocator(number,bodyRows) {
  const prefix=normalizeBookingKey(number),used=new Set(bodyRows.map(row=>String(row.id || '')));
  let next=1n,hasNumber=false;
  for(const row of bodyRows) {
    const id=String(row.id || '');
    const suffix=id.startsWith(prefix)?id.slice(prefix.length):'';
    if(/^\d+$/.test(suffix)){const following=BigInt(suffix)+1n;if(following>next)next=following;hasNumber=true;}
  }
  if(!hasNumber)next=BigInt(bodyRows.length)+1n;
  return ()=>{
    let id;do{id=prefix+String(next++).padStart(3,'0');}while(used.has(id));
    used.add(id);return id;
  };
}
function tallBigComponentPools(rows) {
  const groups=new Map();
  for(const row of rows){const colourKey=colourSelectionKey(row.shade),fabricKey=colourSelectionKey(row.fabricType),key=JSON.stringify([colourKey,fabricKey]);
    if(!groups.has(key))groups.set(key,{key,colourKey,fabricKey,shade:row.shade,fabricType:row.fabricType,quantities:{},weights:{},rows:[]});
    const pool=groups.get(key);pool.rows.push(row);
    for(const [size,qty] of Object.entries(row.quantities || {}))pool.quantities[size]=productionSum([pool.quantities[size] || 0,qty]);
  }
  for(const pool of groups.values())for(const [size,qty] of Object.entries(pool.quantities)){
    const active=pool.rows.filter(row=>row.quantities?.[size]>0);
    pool.weights[size]=active.some(row=>row.weights?.[size]===null || !Number.isFinite(row.weights?.[size]))?null:qty>0?productionSum(active.map(row=>productionMultiply(row.quantities[size],row.weights[size])))/qty:pool.rows.find(row=>Number.isFinite(row.weights?.[size]))?.weights[size] ?? null;
  }
  return Array.from(groups.values());
}
function tallBigAllocationSignature(booking,floor,kind,bodyRows,settings=tallBigSettings(booking,floor)) {
  const manual=reportManualState(booking,floor);
  return compactCardSignature({kind,rows:bodyRows.map(row=>[row.id,colourSelectionKey(row.shade),row.tallBig || '',row.dyeingGroup || '',row.componentAnchor]),
    colours:settings.declarations?.[kind]?.colours || {},dyeingType:componentDyeingType(booking,floor,kind),separate:manual.componentSeparate,fabricSeparate:manual.fabricSeparate});
}
function allocateTallBigPool(pool,batches,booking,floor,kind,declaration) {
  const types={Tall:batches.filter(row=>tallBigBatchType(row,booking,floor)==='Tall'),Big:batches.filter(row=>tallBigBatchType(row,booking,floor)==='Big')};
  const separate=componentIsSeparate(booking,floor,kind,pool.shade,pool.fabricType);
  types.No=batches.filter(row=>!['Tall','Big'].includes(tallBigBatchType(row,booking,floor)) && (separate || !batches.some(batch=>batch.componentAnchor!==undefined) || row.componentAnchor));
  const values=declaration?.colours?.[pool.colourKey],special=types.Tall.length || types.Big.length,errors=[],allocated=new Map();
  if(!special)return {active:false,errors,allocated};
  if(!values?.complete){errors.push(pool.shade+': declare Tall/Big size quantities.');return {active:true,errors,allocated};}
  const requested=values.fabrics?.[pool.fabricKey] || {Tall:{},Big:{}};
  for(const size of new Set([...Object.keys(pool.quantities),...Object.keys(requested.Tall || {}),...Object.keys(requested.Big || {})])) {
    const total=pool.quantities[size] || 0,tall=requested.Tall?.[size] ?? 0,big=requested.Big?.[size] ?? 0;
    if(![total,tall,big].every(qty=>Number.isSafeInteger(qty) && qty>=0)){errors.push(pool.shade+' · '+pool.fabricType+' · '+size+': enter non-negative whole pieces.');continue;}
    if(tall>total || big>total-tall){errors.push(pool.shade+' · '+pool.fabricType+' · '+size+': Tall + Big exceeds '+total+' planned pieces.');continue;}
    for(const [type,qty] of [['Tall',tall],['Big',big],['No',total-tall-big]]) {
      if(qty>0 && !types[type].length){errors.push(pool.shade+' · '+pool.fabricType+' · '+size+': '+(type==='No'?'remaining pieces need a No batch':type+' pieces need a matching '+type+' batch')+'.');continue;}
      types[type].forEach((batch,index)=>{if(!allocated.has(batch))allocated.set(batch,{});allocated.get(batch)[size]=Math.floor(qty/types[type].length)+(index<qty%types[type].length?1:0);});
    }
  }
  return {active:true,errors,allocated};
}
function applyTallBigComponentAllocation(section,booking,floor,bodyRows,nextId) {
  const pools=tallBigComponentPools(section.rows);section.tallBigPools=pools.map(({rows,...pool})=>copyReportData(pool));section.tallBigErrors=[];
  const settings=tallBigSettings(booking,floor),declaration=settings.declarations?.[section.kind];
  if(!tallBigEnabled(booking,floor) || !declaration?.enabled)return;
  const keepManual=section.manual && declaration.manualSignature===tallBigAllocationSignature(booking,floor,section.kind,bodyRows);
  const result=[];
  for(const pool of pools) {
    const batches=bodyRows.filter(row=>colourSelectionKey(row.shade)===pool.colourKey && String(row.id || '').trim());
    const allocation=allocateTallBigPool(pool,batches,booking,floor,section.kind,declaration);
    section.tallBigErrors.push(...allocation.errors);
    if(!allocation.active || allocation.errors.length || keepManual){result.push(...pool.rows);continue;}
    const separate=componentIsSeparate(booking,floor,section.kind,pool.shade,pool.fabricType);
    const allocatedRows=[];
    for(const [batch,quantities] of allocation.allocated) {
      const old=pool.rows.find(row=>(row.bodyBatchId || row.id)===batch.id),template=old || pool.rows[0];
      allocatedRows.push({...copyReportData(template),id:separate?(old?.separate?old.id:nextId()):batch.id,bodyBatchId:batch.id,separate,tallBig:tallBigBatchType(batch,booking,floor),
        shade:batch.shade,ld:batch.ld || '',reference:batch.reference || '',quantities,weights:copyReportData(pool.weights)});
    }
    const positions=new Map(batches.map((batch,index)=>[batch.id,index]));allocatedRows.sort((a,b)=>positions.get(a.bodyBatchId)-positions.get(b.bodyBatchId));result.push(...allocatedRows);
  }
  section.rows=result;section.tallBigDeclared=true;
  section.tallBigErrors=Array.from(new Set(section.tallBigErrors));
}
function syncTallBigManualComponentRows(kind,rows) {
  const booking=currentReportBooking(),settings=tallBigSettings(),declaration=settings.declarations?.[kind];
  if(!tallBigEnabled() || !declaration?.enabled)return;
  const bodies=new Map(currentBatchRows.map(row=>[String(row.id),row]));
  const colours=copyReportData(declaration.colours || {});
  for(const pool of tallBigComponentPools(rows)) {
    if(!colours[pool.colourKey])colours[pool.colourKey]={complete:true,fabrics:{}};
    const quantities={Tall:{},Big:{}};
    for(const row of pool.rows){const body=bodies.get(String(row.bodyBatchId || row.id)),type=body?tallBigBatchType(body,booking,currentViewingFloor):'No';row.tallBig=type;
      if(type==='Tall' || type==='Big')for(const [size,qty] of Object.entries(row.quantities || {}))quantities[type][size]=productionSum([quantities[type][size] || 0,qty]);
    }
    colours[pool.colourKey].fabrics[pool.fabricKey]=quantities;
  }
  declaration.colours=colours;declaration.manualSignature=tallBigAllocationSignature(booking,currentViewingFloor,kind,currentBatchRows,settings);
}
function isTallBigAccessory(fabric) {
  const gsm=String(fabric.gsm ?? "").trim();return gsm==='' || fabricQuantity(gsm)===0;
}
function bodyTallBigPools(rows,fabrics) {
  const pools=new Map();for(const row of rows)for(const fabric of fabrics)if(!isTallBigAccessory(fabric)){const qty=fabricQuantity(row.quantities?.[fabric.key]) || 0;if(qty<=0)continue;
    const colourKey=colourSelectionKey(row.shade),key=JSON.stringify([colourKey,fabric.key]);if(!pools.has(key))pools.set(key,{colourKey,shade:row.shade,fabricKey:fabric.key,fabricName:fabric.name,fabricType:fabric.type,quantities:{kg:0}});
    const pool=pools.get(key);pool.quantities.kg=productionSum([pool.quantities.kg,qty]);
  }return Array.from(pools.values());
}
function validateBodyTallBig(pools,colours,onlyTall=false) {
  for(const pool of pools){const declared=colours[pool.colourKey]?.fabrics?.[pool.fabricKey],tall=declared?.Tall?.kg ?? 0,big=onlyTall?0:declared?.Big?.kg ?? 0;
    if(![tall,big].every(qty=>typeof qty==='number' && Number.isFinite(qty) && qty>=0))return pool.shade+' · '+pool.fabricName+': enter non-negative kg quantities.';
    if(!knittingQuantityAtLeast(pool.quantities.kg,productionSum([tall,big])))return pool.shade+' · '+pool.fabricName+': Tall + Big exceeds '+kgText(pool.quantities.kg)+' kg.';
  }return '';
}
function syncBodyTallBigQuantities(rows) {
  if(!automaticTallBig())return;const colours={};for(const row of rows){const key=colourSelectionKey(row.shade);colours[key] ||= {complete:true,fabrics:{}};for(const fabric of currentFabricRows){if(isTallBigAccessory(fabric))continue;const values=colours[key].fabrics[fabric.key] ||= {Tall:{kg:0},Big:{kg:0}};if(row.tallBig==='Tall' || row.tallBig==='Big')values[row.tallBig].kg=productionSum([values[row.tallBig].kg,fabricQuantity(row.quantities?.[fabric.key]) || 0]);}}
  reportDraft.manual.tallBig.bodyDeclarations={colours};
}
function generateBodyTallBigRows(booking,floor,fabrics,source,colours) {
  const previous=rebuildingConfirmedReport;rebuildingConfirmedReport=true;try{return buildBodyTallBigRows(booking,floor,fabrics,source,colours);}finally{rebuildingConfirmedReport=previous;}
}
function buildBodyTallBigRows(booking,floor,fabrics,source,colours) {
  const pools=bodyTallBigPools(source,fabrics),error=validateBodyTallBig(pools,colours);if(error)throw new Error(error);
  const groups=new Map(),byPool=new Map(pools.map(pool=>[JSON.stringify([pool.colourKey,pool.fabricKey]),pool]));
  // Split each fabric's declared kg across its existing finish groups, preserving
  // Peach, Dyeing Mode and all existing machine eligibility constraints.
  const buckets=new Map();
  for(const row of source)fabrics.forEach((fabric,index)=>{if(fabric.componentKind)return;const qty=fabricQuantity(row.quantities?.[fabric.key]) || 0;if(qty<=0)return;
    const key=colourSelectionKey(row.shade),peach=typeof row.peachFinish==='boolean'?row.peachFinish:fabricPeachForColour(fabric,row.shade,booking,floor),base=fabricBatchGroup(fabric,row.shade,peach,booking,floor),bucketKey=JSON.stringify([key,fabric.key,base.key]);
    if(!buckets.has(bucketKey))buckets.set(bucketKey,{shade:row.shade,key,fabric,index,peach,base,qty:0,ld:new Map(),reference:new Map()});const bucket=buckets.get(bucketKey);bucket.qty=productionSum([bucket.qty,qty]);addDistinctFabricValue(bucket.ld,row.ld);addDistinctFabricValue(bucket.reference,row.reference);
  });
  const scale=(amount,part,total)=>{const a=productionFraction(amount),b=productionFraction(part),c=productionFraction(total);return Number(a.n*b.n*c.d)/Number(a.d*b.d*c.n);};
  for(const bucket of buckets.values()){const {shade,key,fabric,index,peach,base,qty}=bucket,pool=byPool.get(JSON.stringify([key,fabric.key])),declared=pool?colours[key]?.fabrics?.[fabric.key]:null,tall=pool?scale(declared?.Tall?.kg || 0,qty,pool.quantities.kg):0,big=pool?scale(declared?.Big?.kg || 0,qty,pool.quantities.kg):0;
    for(const [type,amount] of [['Tall',tall],['Big',big],['No',productionSum([qty,-tall,-big])]]){if(amount<=0)continue;const groupKey=base.key+':size:'+type,selectionKey=dyeingBatchGroupKey(shade,groupKey);
      if(!groups.has(selectionKey))groups.set(selectionKey,{shade,key:groupKey,baseKey:base.key,type,peach,selectionKey,quantities:Array(fabrics.length).fill(0),ld:new Map(),reference:new Map(),count:1,machine:null});
      const group=groups.get(selectionKey);group.quantities[index]=productionSum([group.quantities[index],amount]);for(const value of bucket.ld.values())addDistinctFabricValue(group.ld,value);for(const value of bucket.reference.values())addDistinctFabricValue(group.reference,value);
    }
  }
  const shades=Array.from(new Map(source.map(row=>[colourSelectionKey(row.shade),row.shade])).values()),components=componentColourSummary(booking,floor,shades);
  for(const shade of shades){const same=Array.from(groups.values()).filter(group=>colourSelectionKey(group.shade)===colourSelectionKey(shade)),anchor=same.some(g=>g.baseKey==='together')?'together':same.some(g=>g.baseKey==='peach')?'peach':null;
    if(!anchor && ((components.get(colourSelectionKey(shade))?.kg || 0)>0 || components.get(colourSelectionKey(shade))?.missing)){const selectionKey=dyeingBatchGroupKey(shade,'components:size:No');groups.set(selectionKey,{shade,key:'components:size:No',baseKey:'components',type:'No',peach:false,selectionKey,quantities:Array(fabrics.length).fill(0),ld:new Map(),reference:new Map(),count:1,machine:null});}
    for(const group of groups.values())if(colourSelectionKey(group.shade)===colourSelectionKey(shade))group.anchor=group.baseKey===(anchor || 'components');
  }
  const ordered=Array.from(groups.values()).sort((a,b)=>['Tall','Big','No'].indexOf(a.type)-['Tall','Big','No'].indexOf(b.type));
  for(const group of ordered){const total=productionSum(group.quantities);if(total>0)try{const result=GenericMachineSelection.selectMachine({totalQuantityKg:total,machines:erpMachineConfigurations(group.shade,floor,fabrics.filter((fabric,index)=>group.quantities[index]>0)),maximumLoadingPercent:BATCH_CALCULATION.defaultMaximumLoadingPercent});group.count=result.selected.batches;group.machine=result.selected;}catch(error){if(!(error instanceof GenericMachineSelection.MachineSelectionError))throw error;}}
  const makeRows=()=>{const rows=[];for(const group of ordered){if(group.count>BATCH_CALCULATION.maxRenderedBatches)throw new Error('Tall/Big quantities require too many batch rows. Choose a larger eligible machine.');for(let index=0;index<group.count;index++)rows.push({id:'',rowKey:'',shade:group.shade,tallBig:group.type,dyeingGroup:group.key,selectionKey:group.selectionKey,peachFinish:group.peach,componentAnchor:group.anchor,
      ld:Array.from(group.ld.values()).join(', '),reference:Array.from(group.reference.values()).join(', '),quantities:Object.fromEntries(fabrics.map((fabric,i)=>[fabric.key,group.quantities[i]/group.count])),machineId:group.machine?.id ?? null,machineLabel:group.machine?.machine.label || '',loading:group.machine?String(Number(group.machine.actualLoadingPercent.toFixed(2)))+'%':'',nozzle:group.machine?String(machineNozzles(group.machine.capacityKg)):'',manual:true,manualNumber:false});}
    orderDyeingModeBatches(rows,fabrics,booking,floor);renumberReportBatches(rows,booking.number);for(const row of rows)row.rowKey='auto-size:'+row.id;return rows;};
  for(let round=0;round<20;round++){
    const rows=makeRows(),evaluations=evaluateManualBatchRows(rows,fabrics,booking,floor);let changed=false;
    for(const group of ordered){const evaluated=evaluations.find(value=>machineEvaluationKey(value)===group.selectionKey),preference=savedColourMachine(booking,floor,group.shade,group.selectionKey),selected=evaluated?.rows.find(row=>row.eligible && preference && String(row.id)===String(preference.machineId)) || evaluated?.rows.find(row=>row.selected && row.eligible);
      if(selected){if(group.count!==selected.batches)changed=true;group.count=selected.batches;group.machine=selected;}else group.machine=null;
    }
    if(!changed)return makeRows();
  }throw new Error('Tall/Big batch allocation could not fit the configured machines. Review the quantities or machine setup.');
}
function openBodyTallBigDeclaration() {
  if(!reportDraft || !canEditReport())return false;if(reportRowEditor){toast('Save or cancel the edited row first.');return false;}
  const pools=bodyTallBigPools(currentBatchRows,currentFabricRows);if(!pools.length){toast('No main fabric quantities are available to declare.');return false;}
  const colours=new Map(pools.map(pool=>[pool.colourKey,pool.shade])),quantities=copyReportData(tallBigSettings().bodyDeclarations?.colours || {});
  for(const [key] of colours){quantities[key] ||= {complete:true,fabrics:{}};for(const pool of pools.filter(pool=>pool.colourKey===key)){quantities[key].fabrics[pool.fabricKey] ||= {Tall:{kg:0},Big:{kg:0}};}}
  closeMachineEvaluation();closeTentativeQuestionnaire(false);
  tallBigDeclarationContext={number:currentViewingNumber,floor:currentViewingFloor,draft:reportDraft,kind:'body',pools,colours:Array.from(colours,([key,shade])=>({key,shade})),quantities,colourKey:Array.from(colours.keys())[0],step:'Tall',reviewed:{},bodyRows:copyReportData(currentBatchRows)};
  $('tallBigDeclarationTitle').textContent='Colour & Batch Info · Declare Tall/Big fabric quantities';$('tallBigDeclarationColour').innerHTML=tallBigDeclarationContext.colours.map(colour=>`<option value="${esc(colour.key)}">${esc(colour.shade)}</option>`).join('');
  $('tallBigDeclarationHelp').textContent='Declare Tall kg, then Big kg, for each fabric with non-zero GSM. Blank or zero GSM fabrics are accessories and are excluded. Remaining kg creates regular batches. Batch quantities, machines and loading follow the existing rules.';
  $('tallBigDeclarationError').textContent='';renderTallBigDeclaration();$('tallBigDeclarationDialog').classList.remove('hidden');$('tallBigDeclarationDialog').setAttribute('aria-hidden','false');$('tallBigDeclarationColour').focus();return true;
}
async function saveBodyTallBigDeclaration(context) {
  const error=validateBodyTallBig(context.pools,context.quantities);if(error){$('tallBigDeclarationError').textContent=error;return false;}
  const before=copyReportData(reportDraft);setMutationBusy(true);
  try{const settings=copyReportData(tallBigSettings());settings.enabled=true;settings.createdBatchOverride=false;settings.bodyDeclarations={colours:copyReportData(context.quantities)};reportDraft.manual.tallBig=settings;
    reportDraft.manual.batchRows=generateBodyTallBigRows(currentReportBooking(),currentViewingFloor,currentFabricRows,context.bodyRows,context.quantities);reportDraft.dirty=true;
    const retained=await retainSavedReportDraft();closeTallBigDeclaration(false);refreshEditableReport();toast(retained?'Tall/Big fabric quantities saved.':'Tall/Big fabric quantities staged. '+reportSaveHint());return true;
  }catch(error){reportDraft=before;context.draft=reportDraft;$('tallBigDeclarationError').textContent=error.message;return false;}finally{setMutationBusy(false);}
}
function renderBodyTallBigDeclaration() {
  const context=tallBigDeclarationContext;context.reviewed[context.colourKey] ||= {};context.reviewed[context.colourKey][context.step]=true;
  $('tallBigDeclarationColour').value=context.colourKey;for(const type of ['Tall','Big'])$('tallBigStep'+type).classList.toggle('active',context.step===type);
  $('tallBigDeclarationBatches').textContent='Declare '+context.step+' kg for this colour’s main fabrics. Batch labels will be selected automatically.';
  const rows=[];context.pools.forEach((pool,index)=>{if(pool.colourKey!==context.colourKey)return;const values=context.quantities[pool.colourKey].fabrics[pool.fabricKey];
    rows.push(`<tr><td>${esc(pool.fabricName)}</td><td>${esc(pool.fabricType)}</td><td>${esc(kgText(pool.quantities.kg))}</td>${context.step==='Big'?'<td>'+esc(values.Tall.kg || 0)+'</td>':''}<td><input type="number" min="0" step="any" data-declare-pool="${index}" data-declare-size="kg" value="${esc(values[context.step].kg ?? 0)}" aria-label="${context.step} kg for ${esc(pool.fabricName)}"></td><td data-declare-remaining="${index}" data-declare-remaining-size="kg">${esc(kgText(productionSum([pool.quantities.kg,-(values.Tall.kg || 0),-(values.Big.kg || 0)])))}</td></tr>`);
  });$('tallBigDeclarationRows').innerHTML=table(['Fabric','Fabrication','Available kg',...(context.step==='Big'?['Tall kg']:[]),context.step+' kg','Regular kg'],rows);
  $('btnTallBigPrevious').classList.toggle('hidden',context.step==='Tall');$('btnTallBigNext').classList.toggle('hidden',context.step==='Big');$('btnSaveTallBigDeclaration').classList.toggle('hidden',context.step==='Tall');
}
let tallBigDeclarationContext=null;
function tallBigDeclarationControl(section,booking,floor) {
  const enabled=tallBigEnabled(booking,floor) && tallBigSettings(booking,floor).declarations?.[section.kind]?.enabled;
  return `<label class="tall-big-control">Do you declare Tall/Big sizes? <select data-component-tall-big="${section.kind}" aria-label="Do you declare Tall/Big sizes for ${esc(section.title)}?" ${confirmedReportLocked(booking,floor)?'disabled':''}><option value="No" ${!enabled?'selected':''}>No</option><option value="Yes" ${enabled?'selected':''}>Yes</option></select></label>${enabled?`<button type="button" class="btn secondary" data-edit-tall-big="${section.kind}">Edit Tall/Big Quantities</button>`:''}`;
}
function openTallBigDeclaration(kind) {
  if(kind==='body')return openBodyTallBigDeclaration();
  if(!reportDraft || !canEditReport())return false;
  if(reportRowEditor){toast('Save or cancel the row being edited first.');refreshEditableReport();return false;}
  if(!tallBigEnabled()){toast('Enable Tall/Big size and select Tall or Big for a batch in Colour & Batch Info first.');refreshEditableReport();return false;}
  const section=currentComponentSections.find(section=>section.kind===kind);if(!section)return false;
  const pools=copyReportData(section.tallBigPools || tallBigComponentPools(section.rows).map(({rows,...pool})=>pool));
  const colours=new Map();
  for(const row of currentBatchRows)if(['Tall','Big'].includes(row.tallBig) && pools.some(pool=>pool.colourKey===colourSelectionKey(row.shade)))colours.set(colourSelectionKey(row.shade),row.shade);
  if(!colours.size){toast('Select Tall or Big for a matching colour in Colour & Batch Info first.');refreshEditableReport();return false;}
  closeMachineEvaluation();closeTentativeQuestionnaire(false);
  const saved=tallBigSettings().declarations?.[kind],quantities=copyReportData(saved?.colours || {});
  for(const [colourKey] of colours){if(!quantities[colourKey])quantities[colourKey]={complete:true,fabrics:{}};quantities[colourKey].complete=true;quantities[colourKey].fabrics ||= {};
    for(const pool of pools.filter(pool=>pool.colourKey===colourKey)){const fabric=quantities[colourKey].fabrics[pool.fabricKey] ||= {Tall:{},Big:{}};for(const type of ['Tall','Big']){fabric[type] ||= {};const hasBatch=currentBatchRows.some(row=>colourSelectionKey(row.shade)===colourKey && row.tallBig===type);for(const size of Object.keys(pool.quantities))if(!hasBatch || fabric[type][size]===undefined)fabric[type][size]=0;}}
  }
  tallBigDeclarationContext={number:currentViewingNumber,floor:currentViewingFloor,draft:reportDraft,kind,title:section.title,pools,colours:Array.from(colours,([key,shade])=>({key,shade})),quantities,colourKey:Array.from(colours.keys())[0],step:'Tall',reviewed:{},bodyRows:copyReportData(currentBatchRows),returnFocus:document.activeElement};
  $('tallBigDeclarationTitle').textContent=section.title+' · Declare Tall/Big sizes';
  $('tallBigDeclarationHelp').textContent='Enter final planned whole pieces, including Flat Allowance. Tall and Big pieces are deducted first; the remaining pieces use this colour’s No batches.';
  $('tallBigDeclarationColour').innerHTML=tallBigDeclarationContext.colours.map(colour=>`<option value="${esc(colour.key)}">${esc(colour.shade)}</option>`).join('');
  $('tallBigDeclarationError').textContent='';renderTallBigDeclaration();
  $('tallBigDeclarationDialog').classList.remove('hidden');$('tallBigDeclarationDialog').setAttribute('aria-hidden','false');$('tallBigDeclarationColour').focus();return true;
}
function closeTallBigDeclaration(restoreFocus=true) {
  const context=tallBigDeclarationContext;tallBigDeclarationContext=null;
  $('tallBigDeclarationDialog').classList.add('hidden');$('tallBigDeclarationDialog').setAttribute('aria-hidden','true');
  if(context && restoreFocus){refreshEditableReport();document.querySelector(`[data-component-tall-big="${context.kind}"]`)?.focus();}
}
function collectTallBigDeclarationInputs() {
  const context=tallBigDeclarationContext;if(!context)return;
  document.querySelectorAll('#tallBigDeclarationRows [data-declare-size]').forEach(input=>{
    const pool=context.pools[Number(input.dataset.declarePool)],fabric=context.quantities[pool.colourKey].fabrics[pool.fabricKey];
    fabric[context.step][input.dataset.declareSize]=String(input.value).trim()===''?0:Number(input.value);
  });
}
function renderTallBigDeclaration() {
  const context=tallBigDeclarationContext;if(!context)return;
  if(context.kind==='body'){renderBodyTallBigDeclaration();return;}
  context.reviewed[context.colourKey] ||= {};context.reviewed[context.colourKey][context.step]=true;
  $('tallBigDeclarationColour').value=context.colourKey;
  for(const type of ['Tall','Big'])$('tallBigStep'+type).classList.toggle('active',context.step===type);
  const batches=context.bodyRows.filter(row=>colourSelectionKey(row.shade)===context.colourKey),matching=batches.filter(row=>row.tallBig===context.step);
  $('tallBigDeclarationBatches').textContent=context.step+' batches: '+(matching.map(row=>row.id).join(', ') || 'None for this colour. Keep '+context.step+' pieces at 0.')+' · No batches: '+(batches.filter(row=>row.tallBig==='No').map(row=>row.id).join(', ') || 'None');
  const rows=[];
  context.pools.forEach((pool,index)=>{if(pool.colourKey!==context.colourKey)return;
    const declared=context.quantities[pool.colourKey].fabrics[pool.fabricKey];
    Object.keys(pool.quantities).sort((a,b)=>compareComponentSizes(componentSize({CCSize:a}),componentSize({CCSize:b}))).forEach(size=>{
      const value=declared[context.step]?.[size] ?? 0,remaining=pool.quantities[size]-(declared.Tall?.[size] || 0)-(declared.Big?.[size] || 0);
      rows.push(`<tr><td>${esc(pool.fabricType)}</td><td>${esc(size)}</td><td>${esc(pool.quantities[size])}</td>${context.step==='Big'?`<td>${esc(declared.Tall?.[size] || 0)}</td>`:''}<td><input type="number" min="0" step="1" data-declare-pool="${index}" data-declare-size="${esc(size)}" value="${esc(value)}" aria-label="${context.step} pieces for ${esc(pool.fabricType+' '+size)}" ${!matching.length?'disabled':''}></td><td data-declare-remaining="${index}" data-declare-remaining-size="${esc(size)}">${esc(remaining)}</td></tr>`);
    });
  });
  $('tallBigDeclarationRows').innerHTML=table(['FabricType','Size','Planned pcs',...(context.step==='Big'?['Tall pcs']:[]),context.step+' pcs','Remaining pcs'],rows);
  $('btnTallBigPrevious').classList.toggle('hidden',context.step==='Tall');$('btnTallBigNext').classList.toggle('hidden',context.step==='Big');$('btnSaveTallBigDeclaration').classList.toggle('hidden',context.step==='Tall');
}
function nextTallBigDeclaration() {
  if(!tallBigDeclarationContext)return false;collectTallBigDeclarationInputs();
  const context=tallBigDeclarationContext;
  if(context.kind==='body'){const error=validateBodyTallBig(context.pools,context.quantities,true);if(error){$('tallBigDeclarationError').textContent=error;return false;}context.step='Big';$('tallBigDeclarationError').textContent='';renderTallBigDeclaration();return true;}
  for(const pool of context.pools)for(const [size,qty] of Object.entries(context.quantities[pool.colourKey]?.fabrics?.[pool.fabricKey]?.Tall || {}))if(!Number.isSafeInteger(qty) || qty<0 || qty>(pool.quantities[size] || 0)){$('tallBigDeclarationError').textContent='Enter non-negative whole Tall pieces within the planned quantity for '+pool.shade+' · '+pool.fabricType+' · '+size+'.';return false;}
  context.step='Big';$('tallBigDeclarationError').textContent='';renderTallBigDeclaration();return true;
}
async function saveTallBigDeclaration() {
  const context=tallBigDeclarationContext;
  if(!context || !reportDraft || !canEditReport())return false;
  if(context.number!==currentViewingNumber || context.floor!==currentViewingFloor || context.draft!==reportDraft){closeTallBigDeclaration(false);return false;}
  if(context.kind==='body'){collectTallBigDeclarationInputs();return saveBodyTallBigDeclaration(context);}
  collectTallBigDeclarationInputs();const booking=currentReportBooking(),declaration={enabled:true,colours:context.quantities};
  for(const colour of context.colours)for(const type of ['Tall','Big'])if(context.bodyRows.some(row=>colourSelectionKey(row.shade)===colour.key && row.tallBig===type) && !context.reviewed[colour.key]?.[type]){
    context.colourKey=colour.key;context.step=type;renderTallBigDeclaration();$('tallBigDeclarationError').textContent='Review '+type+' quantities for '+colour.shade+', then save.';return false;
  }
  for(const pool of context.pools){const result=allocateTallBigPool(pool,context.bodyRows.filter(row=>colourSelectionKey(row.shade)===pool.colourKey),booking,context.floor,context.kind,declaration);if(result.errors.length){$('tallBigDeclarationError').textContent=result.errors[0];return false;}}
  const before=copyReportData(reportDraft);reportDraft.manual.tallBig.declarations={...(reportDraft.manual.tallBig.declarations || {}),[context.kind]:copyReportData(declaration)};reportDraft.dirty=true;setMutationBusy(true);
  try{const retained=await retainSavedReportDraft();closeTallBigDeclaration(false);refreshEditableReport();toast(retained?'Tall/Big quantities saved.':'Tall/Big quantities staged. '+reportSaveHint());return true;}
  catch(error){reportDraft=before;context.draft=reportDraft;$('tallBigDeclarationError').textContent='Could not save. Your entered quantities are available for retry.';showSaveError(error);return false;}finally{setMutationBusy(false);}
}
async function disableTallBigDeclaration(kind) {
  if(!reportDraft || !canEditReport())return false;
  if(reportRowEditor){toast('Save or cancel the row being edited first.');refreshEditableReport();return false;}
  const before=copyReportData(reportDraft),settings=copyReportData(tallBigSettings());
  if(!settings.declarations?.[kind]?.enabled){refreshEditableReport();return true;}
  settings.declarations={...(settings.declarations || {}),[kind]:{...(settings.declarations?.[kind] || {}),enabled:false}};reportDraft.manual.tallBig=settings;reportDraft.dirty=true;setMutationBusy(true);
  try{await retainSavedReportDraft();refreshEditableReport();return true;}catch(error){reportDraft=before;refreshEditableReport();showSaveError(error);return false;}finally{setMutationBusy(false);}
}
$('tallBigDeclarationColour').addEventListener('change',event=>{collectTallBigDeclarationInputs();if(tallBigDeclarationContext){tallBigDeclarationContext.colourKey=event.target.value;$('tallBigDeclarationError').textContent='';renderTallBigDeclaration();}});
$('tallBigDeclarationRows').addEventListener('input',()=>{collectTallBigDeclarationInputs();const context=tallBigDeclarationContext;if(!context)return;document.querySelectorAll('[data-declare-remaining]').forEach(cell=>{const pool=context.pools[Number(cell.dataset.declareRemaining)],size=cell.dataset.declareRemainingSize,declared=context.quantities[pool.colourKey].fabrics[pool.fabricKey];cell.textContent=pool.quantities[size]-(declared.Tall?.[size] || 0)-(declared.Big?.[size] || 0);});});
$('btnTallBigNext').addEventListener('click',nextTallBigDeclaration);$('btnTallBigPrevious').addEventListener('click',()=>{collectTallBigDeclarationInputs();if(tallBigDeclarationContext){tallBigDeclarationContext.step='Tall';$('tallBigDeclarationError').textContent='';renderTallBigDeclaration();}});
$('btnSaveTallBigDeclaration').addEventListener('click',saveTallBigDeclaration);$('btnCloseTallBigDeclaration').addEventListener('click',()=>{if(!mutationBusy)closeTallBigDeclaration();});
$('tallBigDeclarationDialog').addEventListener('click',event=>{if(event.target===$('tallBigDeclarationDialog') && !mutationBusy)closeTallBigDeclaration();});
$('tallBigDeclarationDialog').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();if(!mutationBusy)closeTallBigDeclaration();}if(event.key==='Tab'){const controls=[...$('tallBigDeclarationDialog').querySelectorAll('button,select,input')].filter(input=>!input.disabled && !input.classList.contains('hidden')),first=controls[0],last=controls[controls.length-1];if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}}});
$('reportContent').addEventListener('change',event=>{if(event.target.matches('[data-component-tall-big]')){if(event.target.value==='Yes')openTallBigDeclaration(event.target.dataset.componentTallBig);else disableTallBigDeclaration(event.target.dataset.componentTallBig);}});
$('reportContent').addEventListener('click',event=>{const button=event.target.closest('[data-edit-tall-big]');if(button)openTallBigDeclaration(button.dataset.editTallBig);});
function buildComponentBatches(booking,floor,bodyRows=currentBatchRows) {
  if(!booking)return [];
  const frozen=frozenConfirmedReport(booking,floor);if(frozen)return copyReportData(frozen.components || []);
  const source=getReportBpRows(booking,floor,bodyRows.map(row=>row.shade)),sections=new Map(),bodyByColour=new Map();
  if(!source.length)return [];
  for(const row of bodyRows) {
    const key=colourSelectionKey(row.shade);
    if(!key || !String(row.id || '').trim())continue;
    if(!bodyByColour.has(key))bodyByColour.set(key,[]);
    if(!bodyByColour.get(key).some(batch=>batch.id===row.id))bodyByColour.get(key).push(row);
  }
  for(const row of source) {
    const kinds=componentKinds(bpValue(row,'details'));
    for(const kind of kinds) {
      if(!sections.has(kind))sections.set(kind,{kind,title:COMPONENT_KINDS.find(([key])=>key===kind)[1]+' Batch Info',dyeingType:componentDyeingType(booking,floor,kind),groups:new Map(),sizes:new Map(),warnings:[],rows:[]});
      const section=sections.get(kind),shade=String(bpValue(row,'colour')).trim(),colourKey=colourSelectionKey(shade),fabricType=String(bpValue(row,'fabricType')).trim();
      const size=componentSize(row),qty=fabricQuantity(bpValue(row,'quantity'));
      if(!colourKey){section.warnings.push('BP Data has a component row with no Color; no pieces were allocated.');continue;}
      if(!size){section.warnings.push(shade+': size is missing. Use CCSize (length x width), or separate Length and Width columns.');continue;}
      if(qty===null || !Number.isSafeInteger(qty) || qty<0){section.warnings.push(shade+' · '+size.label+': RequiredQtyPCs must be a non-negative whole number.');continue;}
      if(!size.numeric)section.warnings.push(shade+': size "'+size.label+'" is not length x width; it is listed after numeric sizes.');
      if(kinds.length>1)section.warnings.push(shade+': FabricDetails identifies multiple components. Verify that RequiredQtyPCs is the quantity required for each component.');
      section.sizes.set(size.key,size);
      const groupKey=JSON.stringify([colourKey,fabricType.toLowerCase()]);
      if(!section.groups.has(groupKey))section.groups.set(groupKey,{colourKey,shade,fabricType,quantities:{},sourceWeights:{},weights:{},invalid:false});
      const group=section.groups.get(groupKey),total=(group.quantities[size.key] || 0)+qty;
      if(!Number.isSafeInteger(total)){group.invalid=true;section.warnings.push(shade+': component quantity exceeds the supported whole-piece range.');continue;}
      const weight=fabricQuantity(bpValue(row,'weight'));
      if(!group.sourceWeights[size.key])group.sourceWeights[size.key]=[];
      group.sourceWeights[size.key].push({qty,weight:weight!==null && weight>=0?weight:null});
      group.quantities[size.key]=total;
    }
  }
  const nextId=componentBatchAllocator(booking.number,bodyRows),colourOrder=Array.from(bodyByColour.keys());
  const result=[];
  for(const [kind] of COMPONENT_KINDS) {
    if(!sections.has(kind))continue;
    const section=sections.get(kind),colourIds=new Map();
    section.sizes=Array.from(section.sizes.values()).sort(compareComponentSizes);
    const groups=Array.from(section.groups.values()).sort((a,b)=>{
      const aIndex=colourOrder.indexOf(a.colourKey),bIndex=colourOrder.indexOf(b.colourKey);
      return (aIndex<0?Infinity:aIndex)-(bIndex<0?Infinity:bIndex) || a.colourKey.localeCompare(b.colourKey) || a.fabricType.localeCompare(b.fabricType);
    });
    for(const group of groups)for(const [size,items] of Object.entries(group.sourceWeights)) {
      const active=items.filter(item=>item.qty>0),pieces=productionSum(active.map(item=>item.qty));
      group.weights[size]=active.some(item=>item.weight===null)?null:pieces>0?productionSum(active.map(item=>productionMultiply(item.qty,item.weight)))/pieces:items.find(item=>item.weight!==null)?.weight ?? null;
    }
    section.separate=componentIsSeparate(booking,floor,kind);
    applyComponentAllowance(section,groups,booking,floor);
    for(const group of groups) {
      const separate=componentIsSeparate(booking,floor,kind,group.shade,group.fabricType),allBatches=bodyByColour.get(group.colourKey) || [];
      const batches=!separate && allBatches.some(batch=>batch.componentAnchor!==undefined)?allBatches.filter(batch=>batch.componentAnchor):allBatches;
      if(!batches.length){section.warnings.push(group.shade+': no matching Colour & Batch Info batches on this floor; no pieces were allocated.');continue;}
      if(group.invalid)continue;
      if(currentReportBatchRowsTruncated){section.warnings.push('The body batch display is truncated. Component allocation requires the complete body batch list.');continue;}
      const modeKey=JSON.stringify([group.colourKey,separate?'separate':'together',separate && fabricDyeingChoice(booking,floor,'component:'+kind+':'+colourSelectionKey(group.fabricType),group.shade)===true?group.fabricType:'']);
      if(!colourIds.has(modeKey))colourIds.set(modeKey,batches.map(batch=>separate?nextId():batch.id));
      const ids=colourIds.get(modeKey),count=batches.length;
      batches.forEach((batch,index)=>section.rows.push({id:ids[index],bodyBatchId:batch.id,separate,shade:batch.shade,fabricType:group.fabricType,ld:batch.ld || '',reference:batch.reference || '',
        weights:copyReportData(group.weights),quantities:Object.fromEntries(Object.entries(group.quantities).map(([size,qty])=>[size,Math.floor(qty/count)+(index<qty%count?1:0)]))}));
    }
    section.weightLookup=new Map(groups.map(group=>[JSON.stringify([group.colourKey,group.fabricType.toLowerCase()]),group.weights]));
    const generatedIds=new Map(section.rows.map(row=>[JSON.stringify([colourSelectionKey(row.shade),row.bodyBatchId,row.fabricType]),row.id]));
    delete section.groups;overlayComponentRows(section,booking,floor);
    if(odSettings(kind,booking,floor).mode!=='Need Declaration')applyTallBigComponentAllocation(section,booking,floor,bodyRows,nextId);
    const modeIds=new Map();
    for(const row of section.rows){
      const body=batchesForComponentRow(row,bodyByColour);
      const separate=row.odDeclared || componentIsSeparate(booking,floor,kind,row.shade,row.fabricType);
      if(!row.odDeclared && separate && (row.separate===false || bodyRows.some(batch=>batch.id===row.id))){
        const key=JSON.stringify([colourSelectionKey(row.shade),row.bodyBatchId || row.id,row.fabricType]);
        if(!modeIds.has(key))modeIds.set(key,generatedIds.get(key) || nextId());row.id=modeIds.get(key);
      }else if(!row.odDeclared && !separate && row.separate===true && body)row.id=body.id;
      row.separate=separate;
      row.weights={...(section.weightLookup.get(JSON.stringify([colourSelectionKey(row.shade),String(row.fabricType).toLowerCase()])) || {}),...(row.weights || {})};
      const savedKg=confirmedCaptureContext?.preserveSavedValues && row.manual && Number.isFinite(row.totalKg)?row.totalKg:null;
      componentRowTotals(row);
      if(savedKg!==null)row.totalKg=savedKg;
      if(row.totalKg===null)section.warnings.push(row.shade+' · '+row.fabricType+': enter Weight /Pcs for every size with pieces. Total Qty (kg) and combined machine loading cannot be calculated until weights are supplied.');
    }
    section.separate=section.rows.length?section.rows.every(row=>row.separate):componentIsSeparate(booking,floor,kind);
    section.someSeparate=section.rows.some(row=>row.separate);
    delete section.weightLookup;section.warnings=Array.from(new Set(section.warnings));result.push(section);
  }
  return result;
}
function batchesForComponentRow(row,bodyByColour) {
  const batches=bodyByColour.get(colourSelectionKey(row.shade)) || [];
  return batches.find(batch=>batch.id===(row.bodyBatchId || row.id));
}
function renderComponentSections(booking,floor,bodyRows) {
  currentComponentSections=buildComponentBatches(booking,floor,bodyRows);
  return currentComponentSections.map(section=>{
    const kind='component:'+section.kind;
    const breakdown=(section.allowanceBreakdown || []).map(item=>`<tr><td>${esc(item.shade)}</td><td>${esc(item.size)}</td><td>${esc(item.sourceQty)}</td><td>${esc(item.processLoss)}</td><td>${esc(item.plannedQty)}</td></tr>`);
    return `<section class="section component-section" data-component-kind="${section.kind}"><h3 class="colour-section-heading"><span>${esc(section.title)}${section.separate?' <small class="component-separate-label">Separate</small>':''}</span><span class="report-heading-actions">${odControl(section.kind,booking,floor)}${tallBigDeclarationControl(section,booking,floor)}<label class="component-dyeing-control">Dyeing Type <select data-component-dyeing="${section.kind}" aria-label="Dyeing Type for ${esc(section.title)}" ${mutationBusy?'disabled':''}><option value="Solid" ${section.dyeingType==='Solid'?'selected':''}>Solid</option><option value="YD" ${section.dyeingType==='YD'?'selected':''}>YD</option></select></label><button class="btn success report-add-row" data-report-row-action="add" data-row-kind="${kind}">＋ Add Row</button>${section.manual?`<button class="btn secondary report-add-row" data-reset-component="${section.kind}">Reset from BP Data</button>`:''}</span></h3>
      ${componentEditableTable(section)}<p class="component-note">Total Qty (kg) uses each size’s Weight /Pcs from BP Data. Flat Allowance is applied by colour and size before splitting whole pieces across batches. Edited quantities are final planned pieces; allowance is not added again. Changing Dyeing Type recalculates this section from BP Data.</p>
      ${section.tallBigDeclared?'<p class="tall-big-allocation-note">Declared Tall/Big pieces are assigned to matching batches first. Remaining pieces use the colour’s No batches. Solid shares body batch numbers; YD and Separate retain their separate-number policy.</p>':''}${section.tallBigErrors?.length?'<div class="tall-big-errors" role="alert">'+section.tallBigErrors.map(error=>'<div>'+esc(error)+'</div>').join('')+'</div>':''}
      ${breakdown.length?`<details class="allowance-summary"><summary>Flat Allowance breakdown</summary>${table(['Color','Size','BP pieces','Process Loss','Planned pieces'],breakdown)}</details>`:''}
      ${section.warnings.length?'<div class="batch-calculation-note">'+section.warnings.map(value=>'<div>'+esc(value)+'</div>').join('')+'</div>':''}</section>`;
  }).join('');
}
async function changeComponentDyeingType(kind,value) {
  if(!reportDraft || !canEditReport() || !COMPONENT_KINDS.some(([key])=>key===kind) || !['Solid','YD'].includes(value))return false;
  if(reportRowEditor){toast('Save or cancel the row being edited before changing Dyeing Type.');refreshEditableReport();return false;}
  const before=copyReportData(reportDraft),number=reportDraft.number,floor=reportDraft.floor;
  reportDraft.manual.componentRows={...(reportDraft.manual.componentRows || {}),[kind]:null};
  reportDraft.manual.componentTypes={...(reportDraft.manual.componentTypes || {}),[kind]:value};reportDraft.dirty=true;
  setMutationBusy(true);
  try {
    const retained=await retainSavedReportDraft();
    if(currentViewingNumber===number && currentViewingFloor===floor)refreshEditableReport();
    toast(retained?'Dyeing Type saved.':'Dyeing Type staged. '+reportSaveHint());
    return true;
  } catch(error) {
    if(currentViewingNumber===number && currentViewingFloor===floor){reportDraft=before;refreshEditableReport();}
    showSaveError(error);return false;
  } finally {setMutationBusy(false);}
}
$('reportContent').addEventListener('click',event=>{const button=event.target.closest('[data-reset-component]');if(button)changeComponentDyeingType(button.dataset.resetComponent,componentDyeingType(currentReportBooking(),currentViewingFloor,button.dataset.resetComponent));});
$('reportContent').addEventListener('change',event=>{
  const select=event.target.closest('[data-component-dyeing]');if(select)changeComponentDyeingType(select.dataset.componentDyeing,select.value);
});


// OD BP is an explicit manual batch-count override for Semi Bleach only.
function oneDecimalQty(value){const qty=fabricQuantity(value);return qty===null?String(value ?? ''):qty.toFixed(1);}
function isODSemiBleach(shade){return /^(?:semi[\s_-]*bleach|rfd)$/i.test(String(shade ?? '').trim());}
function odSettings(kind='body',booking=currentReportBooking(),floor=currentViewingFloor){return reportManualState(booking,floor).odBP?.[kind] || {mode:'Regular'};}
function odRows(kind){return kind==='body'?currentBatchRows:currentComponentSections.find(section=>section.kind===kind)?.rows || [];}
function odControl(kind,booking,floor){
  if(!odRows(kind).some(row=>isODSemiBleach(row.shade)))return '';
  const mode=odSettings(kind,booking,floor).mode;
  return `<label class="component-dyeing-control od-bp-control">OD BP <select data-od-mode="${esc(kind)}" aria-label="OD BP for ${esc(kind==='body'?'Colour & Batch Info':kind)}" ${confirmedReportLocked() || mutationBusy?'disabled':''}>${['Regular','As Suggested','Need Declaration'].map(value=>`<option value="${value}" ${mode===value?'selected':''}>${value}</option>`).join('')}</select></label>`;
}
function odColumn(kind){return odSettings(kind).mode!=='Regular';}
let odDeclarationContext=null;
function closeODDeclaration(){odDeclarationContext=null;$('odDeclarationDialog').classList.add('hidden');$('odDeclarationDialog').setAttribute('aria-hidden','true');}
function odContextValid(context){return context && context.draft===reportDraft && context.number===currentViewingNumber && context.floor===currentViewingFloor && canEditReport();}
function openODDeclaration(kind){
  if(!reportDraft || !canEditReport() || mutationBusy)return false;
  if(reportRowEditor){toast('Save or cancel the edited row first.');return false;}
  const rows=copyReportData(odRows(kind));if(!rows.some(row=>isODSemiBleach(row.shade)))return false;
  const old=odSettings(kind),base=copyReportData(old.mode==='Need Declaration' && old.baseRows?old.baseRows:rows.filter(row=>isODSemiBleach(row.shade)));
  odDeclarationContext={kind,number:currentViewingNumber,floor:currentViewingFloor,draft:reportDraft,baseRows:base,rows,count:old.count || 1,colours:copyReportData(old.colours || []),quantityEdits:{},preview:[]};
  for(const row of rows)if(isODSemiBleach(row.shade) && Number.isInteger(row.odBatchIndex)){odDeclarationContext.colours[row.odBatchIndex]=row.odColour || '';if(kind==='body' && old.mode==='Need Declaration')odDeclarationContext.quantityEdits[row.rowKey]=copyReportData(row.quantities);}
  $('odDeclarationTitle').textContent=(kind==='body'?'Colour & Batch Info':kind+' Batch Info')+' · Semi Bleach / RFD OD BP';
  $('odBatchCount').innerHTML=Array.from({length:20},(_,i)=>`<option value="${i+1}" ${i+1===odDeclarationContext.count?'selected':''}>${i+1}</option>`).join('');
  $('odDeclarationError').textContent='';renderODDeclaration();$('odDeclarationDialog').classList.remove('hidden');$('odDeclarationDialog').setAttribute('aria-hidden','false');$('odBatchCount').focus();return true;
}
function collectODColours(){if(!odDeclarationContext)return;document.querySelectorAll('[data-od-colour]').forEach(input=>odDeclarationContext.colours[Number(input.dataset.odColour)]=input.value);}
function collectODQuantities(){
  const context=odDeclarationContext;if(!context || context.kind!=='body')return;
  $('odDeclarationPreview').querySelectorAll('[data-od-qty-row]').forEach(input=>{const row=context.preview[Number(input.dataset.odQtyRow)];if(row){context.quantityEdits[row.rowKey] ||= {};context.quantityEdits[row.rowKey][input.dataset.odQtyFabric]=input.value;}});
}
function editedODRows(context){
  const automatic=makeODRows(context),rows=copyReportData(automatic);if(context.kind!=='body')return rows;
  const fields=currentFabricRows.filter(f=>!isTallBigAccessory(f) && !f.componentKind);
  for(const row of rows)for(const fabric of fields){const value=context.quantityEdits?.[row.rowKey]?.[fabric.key] ?? row.quantities[fabric.key] ?? 0;const qty=String(value).trim()===''?0:fabricQuantity(value);if(qty===null || qty<0)throw new Error('Enter a non-negative kg quantity for '+fabric.name+'.');row.quantities[fabric.key]=Number(qty.toFixed(1));}
  const groupKey=row=>JSON.stringify([colourSelectionKey(row.shade),row.dyeingGroup,row.peachFinish ?? null,row.tallBig || 'No']),groups=new Set(automatic.map(groupKey));
  for(const group of groups)for(const fabric of fields){const expected=productionSum(automatic.filter(r=>groupKey(r)===group).map(r=>r.quantities[fabric.key] || 0)),actual=productionSum(rows.filter(r=>groupKey(r)===group).map(r=>r.quantities[fabric.key] || 0));
    if((expected===0 && actual!==0) || Math.abs(actual-expected)>10+Number.EPSILON*16*Math.max(1,Math.abs(expected),Math.abs(actual)))throw new Error(fabric.name+': declared total '+oneDecimalQty(actual)+' kg must be within ±10 kg of available '+oneDecimalQty(expected)+' kg within the same colour and finish/Tall/Big group.');
  }
  for(const shade of new Set(rows.map(row=>colourSelectionKey(row.shade))))for(const fabric of fields){const expected=productionSum(context.baseRows.filter(r=>colourSelectionKey(r.shade)===shade).map(r=>r.quantities?.[fabric.key] || 0)),actual=productionSum(rows.filter(r=>colourSelectionKey(r.shade)===shade).map(r=>r.quantities[fabric.key] || 0));if(!knittingQuantityAtLeast(actual,productionSum([expected,-10])) || !knittingQuantityAtLeast(productionSum([expected,10]),actual))throw new Error(fabric.name+': this colour’s total must be within ±10 kg of available '+oneDecimalQty(expected)+' kg.');}
  if(rows.some(row=>!(bodyBatchQuantity(row)>0)))throw new Error('Each declared batch must have a positive fabric quantity.');
  return rows;
}
function makeODRows(context){
  const {kind,count,baseRows,colours}=context,byShade=new Map();
  for(const row of baseRows){const key=colourSelectionKey(row.shade);if(!byShade.has(key))byShade.set(key,[]);byShade.get(key).push(row);}
  const result=[];let colourIndex=0;
  for(const shadeRows of byShade.values()){
    const partitions=new Map();for(const row of shadeRows){const key=kind==='body'?JSON.stringify([row.dyeingGroup || 'together',row.peachFinish ?? null,row.tallBig || 'No']):(row.tallBig || 'No');if(!partitions.has(key))partitions.set(key,{rows:[],count:1});partitions.get(key).rows.push(row);}
    const plans=Array.from(partitions.values());if(plans.length>count)throw new Error('Choose at least '+plans.length+' batches to preserve this colour’s existing Peach, Dyeing Mode and Tall/Big groups.');
    for(let extra=plans.length;extra<count;extra++){const target=plans.slice().sort((a,b)=>productionSum(b.rows.map(r=>bodyBatchQuantity(r)))/b.count-productionSum(a.rows.map(r=>bodyBatchQuantity(r)))/a.count)[0];target.count++;}
    for(const plan of plans){const group=plan.rows,localCount=plan.count;
    const fabrics=new Map();for(const row of group){const key=kind==='body'?'body':String(row.fabricType).toLowerCase();if(!fabrics.has(key))fabrics.set(key,[]);fabrics.get(key).push(row);}
    for(let index=0;index<localCount;index++){
      for(const entries of fabrics.values()){
        const first=entries[0],keys=new Set(entries.flatMap(row=>Object.keys(row.quantities || {}))),quantities={};
        for(const key of keys){const total=productionSum(entries.map(row=>fabricQuantity(row.quantities?.[key]) || 0));quantities[key]=kind==='body'?total/localCount:Math.floor(total/localCount)+(index<total%localCount?1:0);}
        const row={...copyReportData(first),id:'',rowKey:'od:'+kind+':'+colourIndex+':'+result.length,quantities,odColour:String(colours[colourIndex] || '').trim(),manual:true,manualNumber:false,odDeclared:true,odBatchIndex:colourIndex};
        if(kind==='body'){row.selectionKey='od:'+colourSelectionKey(row.shade)+':'+(first.selectionKey || first.dyeingGroup || '')+':'+(first.tallBig || 'No');row.dyeingGroup=first.dyeingGroup || 'od';row.machineId=null;row.machineLabel='';row.loading='';row.nozzle='';}
        else{row.weights={};for(const key of keys){const pieces=productionSum(entries.map(r=>r.quantities?.[key] || 0)),active=entries.filter(r=>(r.quantities?.[key] || 0)>0);row.weights[key]=active.some(r=>r.weights?.[key]===null || !Number.isFinite(r.weights?.[key]))?null:pieces?productionSum(active.map(r=>productionMultiply(r.quantities[key],r.weights[key])))/pieces:first.weights?.[key] ?? null;}row.bodyBatchId='';row.separate=true;componentRowTotals(row);}
        result.push(row);
      }colourIndex++;
    }
    }
  }
  return result;
}
function numberODRows(rows,kind,others){
  if(kind==='body'){renumberReportBatches(rows,currentViewingNumber);return;}
  const occupied=[...currentBatchRows,...currentComponentSections.filter(section=>section.kind!==kind).flatMap(section=>section.rows),...others],next=componentBatchAllocator(currentViewingNumber,occupied),ids=new Map();
  for(const row of rows){if(!ids.has(row.odBatchIndex))ids.set(row.odBatchIndex,next());row.id=ids.get(row.odBatchIndex);}
}
function renderODDeclaration(){
  const context=odDeclarationContext;if(!context)return;context.count=Number($('odBatchCount').value) || context.count;
  let rows;try{rows=makeODRows(context);$('odDeclarationError').textContent='';$('btnODSave').disabled=false;}catch(error){$('odDeclarationError').textContent=error.message;$('odDeclarationPreview').innerHTML='';$('btnODSave').disabled=true;context.preview=[];return;}const others=context.rows.filter(row=>!isODSemiBleach(row.shade));
  if(context.kind==='body')numberODRows(rows,'body',others);else numberODRows(rows,context.kind,others);
  context.preview=rows;
  let fields=context.kind==='body'?currentFabricRows.filter(f=>!isTallBigAccessory(f) && !f.componentKind).map(f=>({key:f.key,label:f.name,unit:'kg'})):(currentComponentSections.find(s=>s.kind===context.kind)?.sizes || []).map(size=>({key:size.key,label:size.label,unit:'pcs'}));
  const totals=fields.map(field=>productionSum(context.baseRows.map(row=>row.quantities?.[field.key] || 0)));
  $('odDeclarationTotals').innerHTML=table(fields.map(f=>f.label+' ('+f.unit+')'),['<tr>'+totals.map(qty=>'<td>'+esc(context.kind==='body'?oneDecimalQty(qty):kgText(qty))+'</td>').join('')+'</tr>'])+(context.kind==='body'?'<p class="component-note">Edit each batch’s fabric kg below. Each colour’s fabric total may vary by ±10 kg from its available quantity. Quantities use one decimal place. Changing the batch count resets quantities to an equal split.</p>':'');
  $('odDeclarationPreview').innerHTML=table(['Batch','OD Colour',...(context.kind==='body'?[]:['FabricType']),...fields.map(f=>f.label+' ('+f.unit+')')],rows.map(row=>'<tr><td>'+esc(row.id)+'</td><td><input class="report-row-input" data-od-colour="'+row.odBatchIndex+'" aria-label="OD Colour for '+esc(row.id)+'" value="'+esc(context.colours[row.odBatchIndex] || '')+'" placeholder="Enter colour"></td>'+(context.kind==='body'?'':'<td>'+esc(row.fabricType)+'</td>')+fields.map(field=>'<td>'+(context.kind==='body'?'<input type="number" min="0" step="0.1" class="report-row-input" data-od-qty-row="'+rows.indexOf(row)+'" data-od-qty-fabric="'+esc(field.key)+'" aria-label="'+esc(field.label+' kg for '+row.id)+'" value="'+esc(oneDecimalQty(context.quantityEdits?.[row.rowKey]?.[field.key] ?? row.quantities[field.key] ?? 0))+'" '+((row.quantities[field.key] || 0)>0?'':'disabled')+'>':esc(kgText(row.quantities[field.key] || 0)))+'</td>').join('')+'</tr>'));
}
function assignODMachines(rows){
  const booking=currentReportBooking(),floor=currentViewingFloor,sections=buildComponentBatches(booking,floor,rows);
  for(const row of rows.filter(row=>row.odDeclared)){
    const mass=batchMass(row,sections),used=machineFabricsWithComponents(currentFabricRows.filter(f=>!f.componentKind && (row.quantities[f.key] || 0)>0),booking,floor,row.shade,rows,[row]);
    if(!(mass.totalKg>0))continue;
    try{const evaluation=GenericMachineSelection.selectMachine({totalQuantityKg:mass.totalKg,machines:erpMachineConfigurations(row.shade,floor,used),maximumLoadingPercent:BATCH_CALCULATION.defaultMaximumLoadingPercent}),selected=evaluation.evaluations.filter(c=>c.eligible && c.batches===1).sort((a,b)=>b.actualLoadingPercent-a.actualLoadingPercent || a.capacityKg-b.capacityKg)[0];
      if(selected){row.machineId=selected.id;row.machineLabel=selected.machine.label;row.loading=String(Number(selected.actualLoadingPercent.toFixed(2)))+'%';row.nozzle=String(machineNozzles(selected.capacityKg));}
    }catch(error){if(!(error instanceof GenericMachineSelection.MachineSelectionError))throw error;}
  }
}
async function changeODMode(kind,mode){
  if(!reportDraft || !canEditReport() || mutationBusy || !['Regular','As Suggested','Need Declaration'].includes(mode))return false;
  if(reportRowEditor){toast('Save or cancel the edited row first.');refreshEditableReport();return false;}
  if(mode==='Need Declaration'){const opened=openODDeclaration(kind);refreshEditableReport();return opened;}
  const before=copyReportData(reportDraft),old=odSettings(kind);reportDraft.manual.odBP ||= {};setMutationBusy(true);
  try{
    if(old.mode==='Need Declaration' && old.baseRows){restoreODRows(kind,old.baseRows);}
    reportDraft.manual.odBP[kind]={mode};reportDraft.dirty=true;
    await retainSavedReportDraft();refreshEditableReport();return true;
  }catch(error){reportDraft=before;refreshEditableReport();showSaveError(error);return false;}finally{setMutationBusy(false);}
}
function replaceODBodyRows(semi){
  const previous=copyReportData(currentBatchRows),others=copyReportData(previous.filter(row=>!isODSemiBleach(row.shade))),combined=[...semi,...others];
  for(const row of combined)row.manualNumber=false;
  renumberReportBatches(combined,currentViewingNumber);
  const remap=new Map(others.map((row,index)=>[previous.filter(r=>!isODSemiBleach(r.shade))[index].id,row.id]));
  for(const [kind,rows] of Object.entries(reportDraft.manual.componentRows || {}))if(rows){for(const row of rows)if(!isODSemiBleach(row.shade)){if(remap.has(row.bodyBatchId))row.bodyBatchId=remap.get(row.bodyBatchId);if(!row.separate && remap.has(row.id))row.id=remap.get(row.id);}}
  reportDraft.manual.batchRows=combined;
  // Existing manually edited component pieces remain conserved when body count changes.
  for(const section of currentComponentSections){if(odSettings(section.kind).mode==='Need Declaration')continue;const manual=reportDraft.manual.componentRows?.[section.kind];if(!manual)continue;
    const source=section.rows.filter(row=>isODSemiBleach(row.shade)),groups=new Map();for(const row of source){const key=JSON.stringify([colourSelectionKey(row.shade),row.fabricType,row.tallBig || 'No']);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    const revised=[];for(const entries of groups.values()){const targets=semi.filter(row=>colourSelectionKey(row.shade)===colourSelectionKey(entries[0].shade));if(!targets.length)continue;const keys=new Set(entries.flatMap(row=>Object.keys(row.quantities)));targets.forEach((target,index)=>{const row={...copyReportData(entries[0]),id:target.id,bodyBatchId:target.id,quantities:{}};for(const key of keys){const total=productionSum(entries.map(r=>r.quantities[key] || 0));row.quantities[key]=Math.floor(total/targets.length)+(index<total%targets.length?1:0);}componentRowTotals(row);revised.push(row);});}
    reportDraft.manual.componentRows[section.kind]=[...revised,...manual.filter(row=>!isODSemiBleach(row.shade))];
  }
  const allocated=[...combined,...Object.values(reportDraft.manual.componentRows || {}).flatMap(rows=>rows || []).filter(row=>!row.odDeclared)],next=componentBatchAllocator(currentViewingNumber,allocated);
  for(const [kind,rows] of Object.entries(reportDraft.manual.componentRows || {})){const ids=new Map();for(const row of rows || [])if(row.odDeclared){const key=JSON.stringify([colourSelectionKey(row.shade),row.odBatchIndex]);if(!ids.has(key))ids.set(key,next());row.id=ids.get(key);}}
  assignODMachines(combined);
}
function restoreODRows(kind,baseRows){if(kind==='body')replaceODBodyRows(copyReportData(baseRows));else reportDraft.manual.componentRows={...(reportDraft.manual.componentRows || {}),[kind]:[...copyReportData(baseRows),...copyReportData(odRows(kind).filter(row=>!isODSemiBleach(row.shade)))]};}
async function saveODDeclaration(){
  const context=odDeclarationContext;if(!odContextValid(context) || mutationBusy){closeODDeclaration();return false;}collectODColours();collectODQuantities();const count=Number($('odBatchCount').value);if(!Number.isInteger(count) || count<1 || count>20)return false;context.count=count;
  const before=copyReportData(reportDraft);setMutationBusy(true);
  try{const semi=editedODRows(context);reportDraft.manual.odBP ||= {};reportDraft.manual.odBP[context.kind]={mode:'Need Declaration',count,colours:copyReportData(context.colours),baseRows:copyReportData(context.baseRows)};
    if(context.kind==='body')replaceODBodyRows(semi);else{const others=copyReportData(odRows(context.kind).filter(row=>!isODSemiBleach(row.shade)));numberODRows(semi,context.kind,others);reportDraft.manual.componentRows={...(reportDraft.manual.componentRows || {}),[context.kind]:[...semi,...others]};}
    reportDraft.dirty=true;await retainSavedReportDraft();closeODDeclaration();refreshEditableReport();toast('OD BP batches saved.');return true;
  }catch(error){reportDraft=before;context.draft=reportDraft;$('odDeclarationError').textContent=error.message;return false;}finally{setMutationBusy(false);}
}
$('reportContent').addEventListener('change',event=>{if(event.target.matches('[data-od-mode]'))changeODMode(event.target.dataset.odMode,event.target.value);});
$('odBatchCount').addEventListener('change',()=>{collectODColours();if(odDeclarationContext)odDeclarationContext.quantityEdits={};renderODDeclaration();});
$('odDeclarationPreview').addEventListener('input',event=>{if(event.target.matches('[data-od-qty-row]')){collectODQuantities();$('odDeclarationError').textContent='';}if(event.target.matches('[data-od-colour]')){collectODColours();const index=event.target.dataset.odColour;document.querySelectorAll('[data-od-colour="'+index+'"]').forEach(input=>input.value=event.target.value);}});
$('odDeclarationPreview').addEventListener('change',event=>{if(event.target.matches('[data-od-qty-row]') && fabricQuantity(event.target.value)!==null){event.target.value=oneDecimalQty(event.target.value);collectODQuantities();}});
$('btnODSave').addEventListener('click',saveODDeclaration);$('btnODCancel').addEventListener('click',()=>{if(!mutationBusy)closeODDeclaration();});
$('odDeclarationDialog').addEventListener('keydown',event=>{if(event.key==='Escape' && !mutationBusy){event.preventDefault();closeODDeclaration();}if(event.key==='Tab'){const controls=Array.from($('odDeclarationDialog').querySelectorAll('button,select,input')).filter(input=>!input.disabled),first=controls[0],last=controls[controls.length-1];if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}}});

function generateBlankBatchPlanHtml(booking, floor = activeFloor) {
  const isBlank = (booking.status === 'Pending');

  // General Info Grid
  const general=generalInfoTable(booking,floor);

  // Data rows can be edited individually; the selection algorithm is unchanged.
  const reportTables=buildEditableReportTables(booking,floor);
  const fabricTable=fabricInfoEditableTable(reportTables.fabrics);
  const colorTable=colourBatchEditableTable(reportTables.rows,reportTables.warnings);
  const machineOptions=getMachineSetup().filter(machine=>machineFloorsForMenu(floor).includes(normalizeFloor(machine.floor)) && String(machine.mcType).trim().toUpperCase()==='BULK')
    .map(machine=>`<option value="${esc(String(machine.mcBrand).trim()+'-'+String(machine.mcNo).trim())}"></option>`).join('');

  const componentSections=renderComponentSections(booking,floor,reportTables.rows);

  const instructionTable=editableInstructionTable(booking,floor);

  const badgeClass = booking.status.toLowerCase();
  const formatNotice = isBlank 
    ? `<div style="background:#fffbeb;border:1px solid #fef3c7;padding:10px 14px;border-radius:6px;font-size:12px;color:#92400e;margin-top:14px;font-weight:600">
        ⓘ Pending Batch Plan: Showing deduplicated fabric structure from Knitting Plan. Use the action buttons above to transition this booking to Tentative or Confirm.
       </div>`
    : '';

  return `
    <div class="report-title">
      <h2>${esc(reportFactoryName(floor))}</h2>
      <h3>Batch Plan Report · Order / Booking No: ${esc(booking.number)}${floor ? " · " + esc(floorLabel(floor)) : ""}</h3>
      ${floorOrderLinks(booking.number, floor, true)}
      <div>
        <span class="report-status-badge ${badgeClass}">Current Status: ${esc(booking.status)}</span>
        <span style="font-size:12px;color:#5c6f84;margin-left:10px">Buyer: <strong>${esc(booking.buyer)}</strong></span>
        ${batchPlanRevision(booking.number,floor) ? `<span class="report-revision">${esc(batchPlanRevision(booking.number,floor))}</span>` : ''}
      </div>
      ${formatNotice}
    </div>

    ${reportManualNotice(booking,floor)}
    <datalist id="reportMachineOptions">${machineOptions}</datalist>
    <section class="section">
      <h3 class="colour-section-heading">General Info ${generalInfoActions()}</h3>
      ${general}
    </section>

    <section class="section">
      <h3 class="colour-section-heading">Fabric Info <button type="button" class="btn success report-add-row" data-report-row-action="add" data-row-kind="fabric">＋ Add Row</button></h3>
      ${fabricTable}
    </section>

    <section class="section">
      <h3 class="colour-section-heading">Colour &amp; Batch Info <span class="report-heading-actions">${odControl('body',booking,floor)}${tallBigControl(booking,floor)}${ccDyeingModeControl(booking,floor)}<button type="button" class="btn success report-add-row" data-report-row-action="add" data-row-kind="batch">＋ Add Row</button><button type="button" class="btn machine-evaluation-button" id="btnMachineEvaluation" ${!currentReportMachineEvaluations.length ? 'disabled' : ''}>Machine Selection Evaluation</button></span></h3>
      ${colorTable}
    </section>

    ${componentSections}

    <section class="section">
      <h3 class="colour-section-heading">Instruction <button class="btn success report-add-row" data-report-row-action="add" data-row-kind="instruction">＋ Add Row</button></h3>
      ${instructionTable}
    </section>
    <p class="print-note">Generated from Textile Planning Solution ERP · Timestamp: ${new Date().toLocaleString()}</p>
  `;
}

function openBatchPlanReport(number, {keepMachinePopup=false,reviewLatest=null} = {}) {
  closeTallBigDeclaration(false);
  closeDyeableFilters(false);
  closeBatchPlanPreview(false);
  closeInternalChangeDialog(false);
  closeReconfirmRevisionDialog(false);
  if (!keepMachinePopup) closeMachineEvaluation();
  closeTentativeQuestionnaire(false);
  const original = getStoredMasterList().find(b => b.number === number);
  if (!original || (activeFloor && !hasOrderOnFloor(number,activeFloor))) return;
  const sameReport=currentViewingNumber===number && currentViewingFloor===activeFloor;
  const review=reviewLatest===null ? sameReport && currentReportReviewLatest : !!reviewLatest;
  if(!sameReport || review!==currentReportReviewLatest)discardReportDraft();
  currentViewingNumber=number;currentViewingFloor=activeFloor;currentReportReviewLatest=review;
  const booking=review ? {...getFloorBooking(original),fabric:[],batches:[],recipe:[]} : getFloorBooking(original);
  ensureReportDraft(booking,activeFloor);
  $('reportContent').innerHTML=generateBlankBatchPlanHtml(booking,activeFloor);
  $('btnInternalChange').classList.toggle('hidden',review || booking.status!=='Confirm');
  $('btnMovePending').style.display=review || booking.status==='Pending' ? 'none' : 'inline-flex';
  $('btnMakeTentative').style.display=review || booking.status==='Tentative' ? 'none' : 'inline-flex';
  $('btnMakeConfirm').style.display=!review && booking.status==='Confirm' ? 'none' : 'inline-flex';
  $('btnMakeConfirm').textContent=review ? 'Re-Confirm Latest Plan' : 'Confirm Batch Plan';
  $('batchPlanListView').classList.add('hidden');
  $('uploaderView').classList.add('hidden');
  $('setupView').classList.add('hidden');
  $('batchCardView').classList.add('hidden');
  $('reportsView').classList.add('hidden');
  $('reportContainer').classList.remove('hidden');
  $('reportContent').scrollTop=0;
  setMutationBusy(mutationBusy);
}

/* ============================================================
   9. CHANGE BOOKING STATUS AND SAVE IT
   ============================================================ */
async function updateBookingStatus(newStatus, tentativeAnswers = null, increaseRevision = null) {
  if (!currentViewingNumber || !canEditReport() || !reportDraft) return false;
  if (reportRowEditor) {toast('Save or cancel the row being edited before saving the booking.');return;}
  if(isConfirmedInternalDraft() && reportDraft.dirty){toast('Approve the edits using Internal change, or discard them before changing booking status.');return false;}
  if(reportDraft.reviewLatest && newStatus!=='Confirm'){toast('Re-confirm this review or return to the list to keep the existing confirmed plan.');return false;}
  if(reportDraft.reviewLatest && newStatus==='Confirm') {
    if(typeof increaseRevision!=='boolean'){openReconfirmRevisionDialog();return false;}
    if(!reconfirmContextMatches(reconfirmRevisionContext)){toast('Open the revision choice popup again before saving.');return false;}
    if(!increaseRevision){
      const number=currentViewingNumber;discardReportDraft();openBatchPlanReport(number,{reviewLatest:false});renderBatchRegister();
      toast('The previously confirmed plan and revision are unchanged. Revised data remains in Need Re-Confirm List.');return true;
    }
  }
  if(newStatus==='Confirm'){const error=confirmGeneralInfoError(currentReportBooking(),currentViewingFloor);if(error){toast(error);return false;}}
  if(['Tentative','Confirm'].includes(newStatus)){const error=tallBigSaveError(currentReportBooking(),currentViewingFloor);if(error){toast(error);return false;}}
  if (newStatus==='Tentative' && !tentativeAnswers) {openTentativeQuestionnaire();return false;}
  if (newStatus==='Tentative' && !validTentativeAnswers(tentativeAnswers)) {toast('Answer each Yes/No question before saving.');return false;}
  const master=getStoredMasterList().slice(),index=master.findIndex(booking=>booking.number===currentViewingNumber);
  if(index<0)return;
  const bookingNumber=currentViewingNumber,floor=currentViewingFloor,activeDraft=reportDraft;
  const previousStatus=reportBookingStatus(master[index],floor);
  const previousPlan=savedReportPlan(master[index],floor),previousRevision=previousPlan.confirmedSnapshot?confirmedBatchRevision(master[index],floor):null;
  if(newStatus!=='Pending' && reportDraft.manual.batchRows) {
    const fabrics=reportDraft.manual.fabricRows || currentFabricRows;
    reportDraft.manual.batchRows=sanitizeReportAssignments(reportDraft.manual.batchRows,fabrics,floor).rows;
  }
  writeDraftToBooking(master,index,newStatus);
  const plan=savedReportPlan(master[index],floor);
  if (newStatus==='Tentative') plan.tentativeBy=currentUsername();
  if (newStatus==='Confirm') {
    plan.confirmedBy=currentUsername();
    if(!previousPlan.confirmedSnapshot && !plan.batchPlanCreatedAt)plan.batchPlanCreatedAt=plan.lastSaveAt;
    if(reportDraft.reviewLatest)plan.batchPlanRevisedAt=plan.lastSaveAt;
    plan.flatAllowanceSnapshot=copyReportData(getFlatAllowance());
    const rows=reportDraft.reviewLatest ? reportDraft.reviewSourceRows : getReportKnittingRows(bookingNumber,floor);
    if(reportDraft.reviewLatest && plan.confirmedSnapshot)plan.revisedBatch=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'});
    plan.confirmedSnapshot=makeConfirmedSnapshot(master[index],floor,rows);
    plan.confirmedSnapshot.reportData=captureConfirmedReport(master[index],floor);
    if(previousPlan.confirmedSnapshot)plan.confirmedSnapshot.revisionNo=reportDraft.reviewLatest && increaseRevision?(previousRevision ?? 0)+1:previousRevision;
    if(reportDraft.reviewLatest){
      plan.lastReconfirmation={increaseRevision,previousRevisionNo:previousRevision,revisionNo:plan.confirmedSnapshot.revisionNo,savedAt:plan.lastSaveAt,savedBy:currentUsername(),uploadedYBRevisionNo:revisionNumberFromRows(rows)};
      delete plan.pmcCorrectionAt;delete plan.pmcCorrectionBy;
    }
  }
  if(newStatus==='Confirm' && ['Pending','Tentative'].includes(previousStatus)){
    const header=plan.confirmedSnapshot?.headerData || master[index];
    plan.confirmedAt=plan.lastSaveAt;plan.confirmedFromStatus=previousStatus;
    plan.confirmationHistory=[...(previousPlan.confirmationHistory || []),{number:bookingNumber,buyer:header.buyer || '',unit:header.unit || '',revisionNo:plan.confirmedSnapshot?.revisionNo ?? 0,confirmedAt:plan.lastSaveAt,confirmedBy:plan.confirmedBy,fromStatus:previousStatus}];
  }
  if (newStatus==='Tentative') plan.tentativeAnswers=copyReportData(tentativeAnswers);
  setMutationBusy(true);
  try {
    await saveMasterList(master);
    if(reportDraft===activeDraft){reportDraft.dirty=false;if(newStatus==='Pending')discardReportDraft();}
    toast(`Order ${bookingNumber}${floor?' · '+floorLabel(floor):''} saved as ${newStatus==='Confirm'?'Confirmed':newStatus}.`);
    if(currentViewingNumber===bookingNumber && currentViewingFloor===floor && activeFloor===floor){if(newStatus==='Confirm')discardReportDraft();openBatchPlanReport(bookingNumber,{reviewLatest:false});}
    renderBatchRegister();
    return true;
  }catch(error){showSaveError(error);return false;}finally{setMutationBusy(false);}
}

// Nothing is saved when opening/cancelling this review. All answers must be explicit.
let tentativeQuestionnaireContext = null;
const TENTATIVE_ANSWER_FIELDS = ['labDip','bookingHold','productionConfirmed'];
function validTentativeAnswers(answers) {
  return answers && TENTATIVE_ANSWER_FIELDS.every(field=>['Yes','No'].includes(answers[field])) && typeof answers.others==='string';
}
function openTentativeQuestionnaire() {
  if (!currentViewingNumber || !reportDraft || !canEditReport()) return;
  if (reportRowEditor) {toast('Save or cancel the row being edited before saving the booking.');return;}
  closeMachineEvaluation();
  const booking=currentReportBooking();if(!booking)return;
  tentativeQuestionnaireContext={number:currentViewingNumber,floor:currentViewingFloor,returnFocus:document.activeElement};
  const answers=savedReportPlan(booking,currentViewingFloor).tentativeAnswers || {};
  $('tentativeContext').textContent='Order / Booking No: '+currentViewingNumber+(currentViewingFloor?' · '+floorLabel(currentViewingFloor):'');
  document.querySelectorAll('#tentativeQuestionnaire input[type="radio"]').forEach(input=>input.checked=answers[input.name]===input.value);
  $('tentativeOthers').value=answers.others || '';
  $('tentativeQuestionnaireError').textContent='';
  $('tentativeQuestionnaire').classList.remove('hidden');
  $('tentativeQuestionnaire').setAttribute('aria-hidden','false');
  $('tentativeQuestionnaire').querySelector('input').focus();
}
function closeTentativeQuestionnaire(restoreFocus=true) {
  const context=tentativeQuestionnaireContext;
  tentativeQuestionnaireContext=null;
  $('tentativeQuestionnaire').classList.add('hidden');
  $('tentativeQuestionnaire').setAttribute('aria-hidden','true');
  if(restoreFocus && context)(context.returnFocus || $('btnMakeTentative')).focus();
}
async function saveTentativeQuestionnaire() {
  if(!tentativeQuestionnaireContext || !canChangeData())return false;
  const context=tentativeQuestionnaireContext;
  if(context.number!==currentViewingNumber || context.floor!==currentViewingFloor || context.floor!==activeFloor){closeTentativeQuestionnaire(false);return false;}
  const answers={others:$('tentativeOthers').value.trim()};
  TENTATIVE_ANSWER_FIELDS.forEach(field=>{
    answers[field]=Array.from(document.querySelectorAll('#tentativeQuestionnaire input')).find(input=>input.name===field && input.checked)?.value || '';
  });
  if(!validTentativeAnswers(answers)){
    $('tentativeQuestionnaireError').textContent='Select Yes or No for each of the three questions.';return false;
  }
  const saved=await updateBookingStatus('Tentative',answers);
  if(!saved && tentativeQuestionnaireContext===context)$('tentativeQuestionnaireError').textContent='The booking was not saved. Your answers are still here. Please try again.';
  return saved;
}
$('tentativeQuestionnaireForm').addEventListener('submit',event=>{event.preventDefault();saveTentativeQuestionnaire();});
$('btnCancelTentative').addEventListener('click',()=>closeTentativeQuestionnaire());
$('tentativeQuestionnaire').addEventListener('click',event=>{if(event.target===$('tentativeQuestionnaire') && !mutationBusy)closeTentativeQuestionnaire();});
$('tentativeQuestionnaire').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();if(!mutationBusy)closeTentativeQuestionnaire();}
  if(event.key==='Tab'){
    const controls=Array.from($('tentativeQuestionnaire').querySelectorAll('input,textarea,button')).filter(element=>!element.disabled);
    const first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }
});

$('btnMakeTentative').addEventListener('click', () => updateBookingStatus('Tentative'));
let confirmChecksContext=null;
function closeConfirmChecks(){confirmChecksContext=null;$('confirmChecksDialog').classList.add('hidden');$('confirmChecksDialog').setAttribute('aria-hidden','true');$('btnMakeConfirm').focus();}
function openConfirmChecks(){
  if(!currentViewingNumber || !reportDraft || !canEditReport() || mutationBusy)return false;
  if(reportRowEditor){toast('Save or cancel the row being edited before saving the booking.');return false;}
  confirmChecksContext={number:currentViewingNumber,floor:currentViewingFloor,draft:reportDraft};
  $('confirmChecksDialog').classList.remove('hidden');$('confirmChecksDialog').setAttribute('aria-hidden','false');$('btnConfirmChecksNo').focus();return true;
}
async function proceedConfirmChecks(){
  const context=confirmChecksContext;if(!context || mutationBusy)return false;
  const valid=context.number===currentViewingNumber && context.floor===currentViewingFloor && context.draft===reportDraft;
  closeConfirmChecks();if(!valid){toast('The booking changed. Click Confirm again.');return false;}
  return await updateBookingStatus('Confirm');
}
$('btnMakeConfirm').addEventListener('click',openConfirmChecks);
$('btnConfirmChecksYes').addEventListener('click',proceedConfirmChecks);
$('btnConfirmChecksNo').addEventListener('click',closeConfirmChecks);
$('confirmChecksDialog').addEventListener('click',event=>{if(event.target===$('confirmChecksDialog'))closeConfirmChecks();});
$('confirmChecksDialog').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeConfirmChecks();}
  if(event.key==='Tab'){const first=$('btnConfirmChecksYes'),last=$('btnConfirmChecksNo');if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}}
});
$('btnMovePending').addEventListener('click', () => updateBookingStatus('Pending'));

function backToList() {
  closeDyeableFilters(false);
  closeBatchPlanPreview(false);
  closeInternalChangeDialog(false);
  closeReconfirmRevisionDialog(false);
  closeTentativeQuestionnaire(false);
  closeMachineEvaluation();
  discardReportDraft();
  $('reportContainer').classList.add('hidden');
  $('batchPlanListView').classList.remove('hidden');
  currentViewingNumber = null;
  currentViewingFloor = null;
  renderBatchRegister();
  $('batchPlanListView').scrollTop = 0;
}

$('btnBackToList').addEventListener('click', backToList);
function prepareBatchPlanPrint() {
  let style=$('batchPlanPrintFooter');if(!style){style=document.createElement('style');style.id='batchPlanPrintFooter';document.head.appendChild(style);}
  const left='Printed Date & Time: '+dyeablePrintedAt(new Date().toISOString())+', Print by: '+currentUsername();
  const cssText=value=>JSON.stringify(value).replace(/</g,'\\3c ');
  style.textContent='@media print{@page batch-plan{size:A4 landscape;margin:8mm 8mm 18mm;@bottom-left{content:'+cssText(left)+';font:7pt Arial;vertical-align:middle;width:40%}@bottom-center{content:"This is the PMC internal ERP System Generated Report";font:7pt Arial;vertical-align:middle;width:42%}@bottom-right{content:"Page " counter(page,decimal-leading-zero) " out of " counter(pages,decimal-leading-zero);font:bold 7pt Arial;vertical-align:middle;width:18%}}}';
}
function printBatchPlan(){prepareBatchPlanPrint();window.print();}
window.addEventListener('beforeprint',prepareBatchPlanPrint);
$('btnPrintReport').addEventListener('click',printBatchPlan);

/* Read-only full report view. Zoom and printing never commit booking drafts. */
let batchPlanPreviewState=null;
function closeBatchPlanPreview(restoreFocus=true) {
  const state=batchPlanPreviewState;batchPlanPreviewState=null;
  $('batchPlanPreviewDialog').classList.add('hidden');$('batchPlanPreviewDialog').setAttribute('aria-hidden','true');
  $('batchPlanPreviewPaper').replaceChildren();
  if(state && restoreFocus)state.returnFocus?.focus();
}
function setBatchPlanPreviewZoom(value) {
  if(!batchPlanPreviewState)return;
  const state=batchPlanPreviewState,scale=Math.max(.05,Math.min(2,Number(value) || 1));state.scale=scale;
  const paper=$('batchPlanPreviewPaper'),page=paper.firstElementChild;if(!page)return;
  const height=Math.max(page.scrollHeight || 0,page.offsetHeight || 0,1);
  page.style.transform='scale('+scale+')';
  paper.style.width=state.width*scale+'px';paper.style.height=height*scale+'px';
  $('batchPlanPreviewZoom').textContent=Math.round(scale*100)+'%';
  $('btnPreviewZoomOut').disabled=scale<=.05;$('btnPreviewZoomIn').disabled=scale>=2;
}
function fitBatchPlanPreview(mode='width') {
  if(!batchPlanPreviewState)return;
  batchPlanPreviewState.fit=mode;
  const viewport=$('batchPlanPreviewViewport'),page=$('batchPlanPreviewPaper').firstElementChild;
  if(!page)return;
  const width=(viewport.clientWidth || 1100)-48,height=(viewport.clientHeight || 700)-48;
  const scale=mode==='page'?Math.min(width/batchPlanPreviewState.width,height/Math.max(page.scrollHeight || page.offsetHeight || 1,1)):width/batchPlanPreviewState.width;
  setBatchPlanPreviewZoom(Math.min(1,scale));viewport.scrollTop=0;viewport.scrollLeft=0;
}
function openBatchPlanPreview() {
  if(!currentViewingNumber || $('reportContainer').classList.contains('hidden'))return false;
  if(reportRowEditor){toast('Save or cancel the row being edited before opening the full view.');return false;}
  closeMachineEvaluation();
  const page=$('reportContent').cloneNode(true);
  page.removeAttribute('id');page.removeAttribute('aria-live');page.classList.add('batch-plan-preview-page');
  page.querySelectorAll('[id]').forEach(element=>element.removeAttribute('id'));
  page.querySelectorAll('.report-edit-table').forEach(table=>{
    const heading=table.querySelector('thead tr');if(heading?.lastElementChild?.textContent.trim()==='Action')heading.lastElementChild.remove();
    table.querySelectorAll('.report-row-actions').forEach(element=>element.remove());
  });
  page.querySelectorAll('button,.report-floor-links,.manual-report-notice:not(.internal-change-notice),.print-note,.manual-row-label,.row-edit-label,.cc-mode-control').forEach(element=>element.remove());
  page.querySelectorAll('input,textarea,select').forEach(element=>{
    const text=document.createElement('span');
    text.textContent=element.tagName==='SELECT'?(Array.from(element.querySelectorAll('option')).find(option=>option.selected)?.textContent || element.value):element.value;
    element.replaceWith(text);
  });
  const widths=Array.from($('reportContent').querySelectorAll('table')).map(table=>table.scrollWidth || 0);
  const width=Math.max(1480,...widths)+48;page.style.width=width+'px';
  batchPlanPreviewState={number:currentViewingNumber,floor:currentViewingFloor,width,scale:1,fit:'width',returnFocus:document.activeElement};
  $('batchPlanPreviewPaper').replaceChildren(page);
  $('batchPlanPreviewContext').textContent='Order '+currentViewingNumber+(currentViewingFloor?' · '+floorLabel(currentViewingFloor):'')+' · Read-only view';
  $('batchPlanPreviewDialog').classList.remove('hidden');$('batchPlanPreviewDialog').setAttribute('aria-hidden','false');
  // The paper expands every table and section; only the outer viewport scrolls.
  const expandedWidth=Math.max(width,page.scrollWidth || 0);batchPlanPreviewState.width=expandedWidth;page.style.width=expandedWidth+'px';
  fitBatchPlanPreview();$('btnCloseBatchPlanPreview').focus();return true;
}
$('btnViewBatchPlan').addEventListener('click',openBatchPlanPreview);
$('btnCloseBatchPlanPreview').addEventListener('click',()=>closeBatchPlanPreview());
$('btnPreviewZoomOut').addEventListener('click',()=>{if(batchPlanPreviewState){batchPlanPreviewState.fit=null;setBatchPlanPreviewZoom(batchPlanPreviewState.scale-.1);}});
$('btnPreviewZoomIn').addEventListener('click',()=>{if(batchPlanPreviewState){batchPlanPreviewState.fit=null;setBatchPlanPreviewZoom(batchPlanPreviewState.scale+.1);}});
$('btnPreviewActualSize').addEventListener('click',()=>{if(batchPlanPreviewState){batchPlanPreviewState.fit=null;setBatchPlanPreviewZoom(1);}});
$('btnPreviewFitWidth').addEventListener('click',()=>fitBatchPlanPreview('width'));
$('btnPreviewFitPage').addEventListener('click',()=>fitBatchPlanPreview('page'));
$('btnPreviewPrint').addEventListener('click',printBatchPlan);
$('batchPlanPreviewDialog').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeBatchPlanPreview();return;}
  if(event.key==='Tab'){
    const controls=Array.from($('batchPlanPreviewDialog').querySelectorAll('button,[tabindex="0"]')).filter(element=>!element.disabled),first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }
});
window.addEventListener('resize',()=>{if(batchPlanPreviewState?.fit)fitBatchPlanPreview(batchPlanPreviewState.fit);});


document.querySelectorAll('.status-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.status-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeStatusTab = btn.dataset.status;
    renderBatchRegister();
  });
});

document.querySelectorAll('.buyer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.buyer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeBuyerFilter = btn.dataset.buyer;
    renderBatchRegister();
  });
});

$('btnScrollBuyerLeft').addEventListener('click', () => {
  $('buyerPillsContainer').scrollBy({ left: -220, behavior: 'smooth' });
});
$('btnScrollBuyerRight').addEventListener('click', () => {
  $('buyerPillsContainer').scrollBy({ left: 220, behavior: 'smooth' });
});

$('globalSearchInput').addEventListener('keyup', e => {
  if (e.key === 'Enter') renderBatchRegister();
});
$('btnRunSearch').addEventListener('click', renderBatchRegister);
$('btnClearSearch').addEventListener('click', () => {
  $('globalSearchInput').value = '';
  renderBatchRegister();
});

$('colSearchOrder').addEventListener('input', renderBatchRegister);
$('colSearchDate').addEventListener('input', renderBatchRegister);
$('colSearchBuyer').addEventListener('input', renderBatchRegister);

$('batchRegisterRows').addEventListener('click', e => {
  if (handleFloorOrderJump(e)) return;
  const btn = e.target.closest('.btn-view-eye');
  if (btn) {
    const bookingNo = btn.dataset.booking;
    const reviewLatest=activeStatusTab==='NeedReconfirm';
    if(btn.dataset.bookingFloor)selectFloor(btn.dataset.bookingFloor==='ALL' ? null : btn.dataset.bookingFloor);
    openBatchPlanReport(bookingNo,{reviewLatest});
  }
});

$('reportContent').addEventListener('click', handleFloorOrderJump);

/* ============================================================
   10. DISPLAY THE UPLOADED FILE DIRECTORY
   ============================================================ */
function renderFileList() {
  const files = getStoredFiles();
  const tbody = $('fileTableRows');
  if (files.length === 0) {
    tbody.innerHTML = '';
    $('noFilesMsg').classList.remove('hidden');
    return;
  }
  $('noFilesMsg').classList.add('hidden');
  tbody.innerHTML = files.map(f => `
    <tr>
      <td><span style="font-weight:700;color:#1e3a5f">${esc(f.category)}</span></td>
      <td><strong>${esc(f.name)}</strong></td>
      <td>${esc(f.size)}</td>
      <td>${esc(f.uploadedBy)}</td>
      <td>${esc(f.date)}</td>
      <td style="text-align:center">
        <button class="btn danger" style="padding:4px 9px;font-size:11.5px" data-delete="${esc(f.id)}" title="Delete file">🗑 Delete</button>
      </td>
    </tr>
  `).join('');
}

document.querySelectorAll('.tab-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    activeCategory = btn.dataset.category;
    $('currentCategoryText').textContent = activeCategory;
  });
});

$('fileInput').addEventListener('change', e => {
  if (e.target.files.length) {
    selectedFile = e.target.files[0];
    $('fileNameDisplay').textContent = `${selectedFile.name} (${formatBytes(selectedFile.size)})`;
  } else {
    selectedFile = null;
    $('fileNameDisplay').textContent = 'No file selected.';
  }
});

/**
 * Upload & Process Logic:
 * If a file with the SAME NAME already exists, replace it automatically.
 */
/* ============================================================
   11. READ EXCEL AND MAP ITS COLUMNS TO BOOKINGS
   ============================================================ */
$('uploadBtn').addEventListener('click', async () => {
  if (!canChangeData()) return;
  if (!selectedFile) { toast('Please select an Excel (.xlsx/.xls) file first.'); return; }
  // Capture these so changing the category or selection cannot change this import.
  const uploadFile = selectedFile;
  const category = activeCategory;
  const originalButtonText = $('uploadBtn').textContent;
  setMutationBusy(true);
  $('uploadBtn').textContent = 'Processing…';
  let stage = 'loading';
  try {
    $('uploadBtn').textContent = 'Loading Excel reader…';
    const excelReader = await ensureExcelReader();
    $('uploadBtn').textContent = 'Processing…';
    stage = 'reading';
    await new Promise(resolve => setTimeout(resolve, 0));
    const data = new Uint8Array(await uploadFile.arrayBuffer());
    stage = 'parsing';
    const workbook = excelReader.read(data, { type: 'array', cellStyles: false, cellHTML: false });
    const datasets = { ...getStoredDatasets() };
    const master = getStoredMasterList().slice();
    let importedCount = 0;
    if (category === 'General Information & Planning') {
      const sheetName = workbook.Sheets[APP_SETTINGS.generalInfoSheetName] ? APP_SETTINGS.generalInfoSheetName : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) throw new Error('Could not find General Info sheet in workbook');
      const rows = excelReader.utils.sheet_to_json(sheet, { defval: '' });
      datasets.genInfo = Object.assign(Object.create(null), datasets.genInfo || {});
      const bookingIndex = new Map(master.map((m, i) => [normalizeBookingKey(m.number), i]));
      const newBookings = [];
      rows.forEach(r => {
        const orderNo = String(r.OrderNo || '').trim();
        if (!orderNo) return;
        datasets.genInfo[orderNo] = r;
        const existingIndex = bookingIndex.has(normalizeBookingKey(orderNo)) ? bookingIndex.get(normalizeBookingKey(orderNo)) : -1;
                // EDIT EXCEL COLUMN MAPPINGS HERE.
        // Example: r.Buyer reads the Excel column named Buyer.
        // Example: r['Buyer Team'] reads the column named Buyer Team.
        // Keep the text between quotes equal to your Excel header.
        const orderPayload = {
            number: orderNo,
            buyer: r.Buyer || 'UNKNOWN',
            team: r['Buyer Team'] || '—',
            date: formatExcelDate(r.BookingReceiveDate),
            status: existingIndex !== -1 ? master[existingIndex].status : 'Pending',
            eventDay: String(r['Event day'] || '—'),
            style: r.Style || '—',
            pmc: r.PMC || '—',
            merchant: r.BookingBy || '—',
            unit: r.Unit || r['Booking Unit'] || '',
            brush: r.Brush || '',
            peach: r.Peach || '',
            heatset: r.Heatset || '',
            knitStart: formatExcelDate(r['T&A Knitting Start']),
            knitEnd: formatExcelDate(r['T&A Knitting End']),
            dyeStart: formatExcelDate(r['T&A Dyeing Start']),
            dyeEnd: formatExcelDate(r['T&A Dyeing End']),
            deliveryStart: formatExcelDate(r['T&A Deli. Start'] || r['1st Shipment Date']),
            deliveryEnd: formatExcelDate(r['T&A Deli. End'] || r['Last Shipment Date']),
            lastRevised: existingIndex !== -1 ? master[existingIndex].lastRevised : '—',
            batchDate: existingIndex !== -1 ? master[existingIndex].batchDate : formatExcelDate(r['Final Confirmation']),
            revisedBatch: existingIndex !== -1 ? master[existingIndex].revisedBatch : '—',
            fabric: existingIndex !== -1 ? master[existingIndex].fabric : [],
            batches: existingIndex !== -1 ? master[existingIndex].batches : [],
            instructions: [r['Fabric Notes'], r['PMC Notes']].filter(Boolean),
            recipe: existingIndex !== -1 ? master[existingIndex].recipe : []
          };
        if (existingIndex !== -1) {
          master[existingIndex] = { ...master[existingIndex], ...orderPayload };
        } else {
          bookingIndex.set(normalizeBookingKey(orderNo), master.length);
          newBookings.push(orderNo);
          master.push(orderPayload);
        }
        importedCount++;
      });
      // Preserve the original new-bookings-first display without quadratic lookups.
      const newNumbers = new Set(newBookings);
      const topRows = master.filter(m => newNumbers.has(m.number)).reverse();
      const oldRows = master.filter(m => !newNumbers.has(m.number));
      master.length = 0;
      for (const item of topRows) master.push(item);
      for (const item of oldRows) master.push(item);
    } else if (category === 'BP Data') {
      captureMissingConfirmedSnapshots(master);
      const sheetName=workbook.Sheets[APP_SETTINGS.bpDataSheetName] ? APP_SETTINGS.bpDataSheetName : workbook.SheetNames[0];
      const sheet=workbook.Sheets[sheetName];
      if(!sheet)throw new Error('Could not find the BP Data sheet.');
      const rows=excelReader.utils.sheet_to_json(sheet,{defval:''});
      if(rows.length){
        const headers=new Set(Object.keys(rows[0]).map(knittingInfoHeaderKey));
        for(const field of ['order','colour','details','fabricType','quantity']) {
          if(!BP_DATA_HEADERS[field].some(header=>headers.has(knittingInfoHeaderKey(header))))throw new Error('BP Data is missing the '+BP_DATA_HEADERS[field][0]+' column.');
        }
      }
      const grouped=Object.create(null);
      for(const row of rows) {
        const number=String(bpValue(row,'order')).trim();
        if(!number)continue;
        const key=normalizeBookingKey(number);
        if(!grouped[key])grouped[key]=[];
        grouped[key].push(row);importedCount++;
      }
      const previous={...(datasets.bpData || {})},owners={...(datasets.bpDataOwners || {})},owner=uploadFile.name.toLowerCase();
      for(const key of Object.keys(previous))if(Object.prototype.hasOwnProperty.call(grouped,normalizeBookingKey(key)) || owners[normalizeBookingKey(key)]===owner){delete previous[key];delete owners[normalizeBookingKey(key)];}
      for(const key of Object.keys(grouped))owners[key]=owner;
      datasets.bpData=Object.assign(Object.create(null),previous,grouped);
      datasets.bpDataOwners=owners;
    } else if (category === 'Knitting Plan') {
      captureMissingConfirmedSnapshots(master);
      const sheetName = workbook.Sheets[APP_SETTINGS.knittingPlanSheetName] ? APP_SETTINGS.knittingPlanSheetName : workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) throw new Error('Could not find Knitting & Delivery Plan sheet in workbook');
      const rows = excelReader.utils.sheet_to_json(sheet, { defval: '' });
      const replacementRows = Object.create(null);
      for (const r of rows) {
        const orderNo = String(r.OrderNo || r['Booking No'] || r['Booking No.'] || r['Booking Number'] || '').trim();
        if (!orderNo) continue;
        const orderKey = normalizeBookingKey(orderNo);
        if (!replacementRows[orderKey]) replacementRows[orderKey] = [];
        // Persist values by physical Excel column, not by the header wording.
        replacementRows[orderKey].push({
          ...r,
          _fabricColumns: readKnittingFabricColumns(sheet, r)
        });
        importedCount++;
      }
      // Replace each incoming booking's complete set of rows; do not accumulate
      // duplicates and inflated quantities when the same file is uploaded again.
      const previousPlan = { ...(datasets.knitPlan || {}) };
      for (const previousKey of Object.keys(previousPlan)) {
        if (Object.prototype.hasOwnProperty.call(replacementRows, normalizeBookingKey(previousKey))) delete previousPlan[previousKey];
      }
      datasets.knitPlan = Object.assign(Object.create(null), previousPlan, replacementRows);
      const knownBookings = new Set(master.map(b => normalizeBookingKey(b.number)));
      for (const [number, items] of Object.entries(replacementRows)) {
        if (knownBookings.has(number)) continue;
        const first = items[0];
        master.push({ number, buyer: first.Buyer || first['Buyer Name'] || 'UNKNOWN',
          date: formatExcelDate(first.BookingReceiveDate), status: 'Pending',
          fabric: [], batches: [], recipe: [], instructions: [] });
        knownBookings.add(number);
      }
    } else {
      throw new Error('Please select a supported file category.');
    }
    if (!importedCount) throw new Error('No booking records found. Check that the sheet has an OrderNo column.');
    const previousFiles = getStoredFiles();
    const isReplaced = previousFiles.some(f => f.name.toLowerCase() === uploadFile.name.toLowerCase());
    const files = previousFiles.filter(f => f.name.toLowerCase() !== uploadFile.name.toLowerCase());
    files.unshift({
      id: 'file_' + Date.now(), category, name: uploadFile.name,
      size: formatBytes(uploadFile.size), uploadedBy: APP_SETTINGS.uploadedBy,
      date: new Date().toLocaleString()
    });
    stage = 'saving';
    // One transaction saves the rows, bookings and file record together.
    await commitChanges({ datasets, master, files });
    renderFileList();
    renderBatchRegister();
    const actionText = isReplaced ? 'replaced previous version' : 'uploaded';
    toast(`File "${uploadFile.name}" successfully ${actionText} (${importedCount} records processed).`);
    if (selectedFile === uploadFile) {
      $('fileInput').value = '';
      selectedFile = null;
      $('fileNameDisplay').textContent = 'No file selected.';
    }
  } catch (err) {
    if (stage === 'saving') showSaveError(err);
    else if (stage === 'loading') toast(err.message);
    else toast((stage === 'reading' ? 'File reading error: ' : 'Sheet parsing error: ') + err.message);
  } finally {
    $('uploadBtn').textContent = originalButtonText;
    setMutationBusy(false);
  }
});

/* ============================================================
   12. DELETE FILE RECORDS
   ============================================================ */
// Delete files
$('fileTableRows').addEventListener('click', async e => {
  const delBtn = e.target.closest('[data-delete]');
  if (delBtn) {
    if (!canChangeData()) return;
    const id = delBtn.dataset.delete;
    const files = getStoredFiles().filter(f => f.id !== id);
    setMutationBusy(true);
    try {
      await saveStoredFiles(files);
      renderFileList();
      toast('File record removed.');
    } catch (err) {
      showSaveError(err);
    } finally {
      setMutationBusy(false);
    }
  }
});

/* ============================================================
   13. NAVIGATION AND STARTUP
   ============================================================ */
function switchMainView(view) {
  closeDailyConfirmFilters();
  closeDyeableFilters(false);
  closeBatchPlanPreview(false);
  closeInternalChangeDialog(false);
  closeReconfirmRevisionDialog(false);
  closeTentativeQuestionnaire(false);
  closeMachineEvaluation();
  discardReportDraft();
  for (const [key, navId, viewId] of [
    ['upload', 'navUpload', 'uploaderView'],
    ['setup', 'navSetup', 'setupView'],
    ['batch', 'navBatch', 'batchPlanListView'],
    ['cards','navBatchCard','batchCardView'],
    ['reports','navReport','reportsView']
  ]) {
    $(navId).classList.toggle('active', key === view);
    $(viewId).classList.toggle('hidden', key !== view);
  }
  $('reportContainer').classList.add('hidden');
  currentViewingNumber = null;
  currentViewingFloor = null;
  document.querySelectorAll('#floorSubmenus .nav-floor').forEach(button => button.classList.toggle('active', view === 'batch' && button.dataset.floor === activeFloor));
  $('viewEyebrow').textContent = view === 'batch' ? 'Planning & Production Info' : 'Data Management';
  $('viewTitle').textContent = view === 'upload' ? 'Source File Upload' : view === 'setup' ? 'Setup' : 'Batch Plan Generation' + (activeFloor ? ' · ' + floorLabel(activeFloor) : '');
  $('viewBadgeText').textContent = storageReady ? (view === 'batch' ? 'Active Register' : 'Storage Active') : 'Storage unavailable';
  $('navDailyConfirm').classList.toggle('active',view==='reports' && dyeableReportMode==='daily');
  $('navDyeableBatch').classList.toggle('active',view==='reports' && dyeableReportMode==='detail');
  $('navDyeableSummary').classList.toggle('active',view==='reports' && dyeableReportMode==='summary');
  if(view==='reports'){
    $('viewEyebrow').textContent='Reports';$('viewTitle').textContent=dyeableReportMode==='daily'?'Daily Confirm Batch Plan':dyeableReportMode==='summary'?'Dyeable Batch Summary':'Dyeable Batch';$('viewBadgeText').textContent=storageReady?'Report Preview':'Storage unavailable';renderDyeableReport();return;
  }
  if(view==='cards'){
    $('viewEyebrow').textContent='Planning & Production Info';$('viewTitle').textContent='Batch Card'+(activeCardFloor?' · '+floorLabel(activeCardFloor):'');renderCardRegister();return;
  }
  if (view === 'upload') renderFileList();
  else if (view === 'setup') renderSetupPanels();
  else renderBatchRegister();
}

$('navUpload').addEventListener('click', () => switchMainView('upload'));
$('navSetup').addEventListener('click', () => switchMainView('setup'));
$('navBatch').addEventListener('click', () => selectFloor(null));
$('floorSubmenus').addEventListener('click', event => {
  const button = event.target.closest('[data-floor]');
  if (button) selectFloor(button.dataset.floor);
});

/* Batch cards are immutable snapshots of confirmed plans, versioned on regeneration. */
let activeCardFloor=null,activeCardStatus='Pending',cardPage=1,cardPageSize='10',currentCardOrder=null,currentCardRecordId=null;
const confirmedCardCache=new WeakMap();
function getBatchCards(){return appState.cards || [];}
function cardKey(number,floor,batchId){return JSON.stringify([normalizeBookingKey(number),floor,batchId]);}
function compactCardSignature(value){
  const text=knittingSourceFingerprint([value]);let a=0x811c9dc5,b=0x9e3779b9;
  for(let index=0;index<text.length;index++){const code=text.charCodeAt(index);a=Math.imul(a^code,0x01000193);b=Math.imul(b^code,0x85ebca6b);}
  return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
}
function confirmedCardPlan(original,floor){
  if(!original || reportBookingStatus(original,floor)!=='Confirm')return null;
  let cache=confirmedCardCache.get(original);if(!cache){cache=new Map();confirmedCardCache.set(original,cache);}
  const prior=cache.get(floor);
  if(prior && prior.setup===appState.setup && prior.flat===appState.flatAllowance && prior.datasets===appState.datasets)return prior.value;
  const saved={number:currentViewingNumber,floor:currentViewingFloor,review:currentReportReviewLatest,draft:reportDraft,editor:reportRowEditor,fabrics:currentFabricRows,batches:currentBatchRows,evaluations:currentReportMachineEvaluations,truncated:currentReportBatchRowsTruncated,components:currentComponentSections};
  let value;
  try{
    currentViewingNumber=original.number;currentViewingFloor=floor;currentReportReviewLatest=false;reportDraft=null;reportRowEditor=null;
    const booking=getFloorBooking(original,floor),tables=buildEditableReportTables(booking,floor),components=buildComponentBatches(booking,floor,tables.rows),instructions=instructionRows(booking,floor),entries=new Map();
    const add=(id,shade,ld,reference)=>{if(!entries.has(id))entries.set(id,{id,shade,ld:ld || '',reference:reference || '',machineLabel:'',bodyRows:[],components:[],qtyKg:0});return entries.get(id);};
    for(const row of tables.rows){if(!row.id)continue;const entry=add(row.id,row.shade,row.ld,row.reference);entry.bodyRows.push(copyReportData(row));entry.machineLabel=row.machineLabel || entry.machineLabel;entry.qtyKg=productionSum([entry.qtyKg,bodyBatchQuantity(row,tables.fabrics)]);}
    for(const section of components)for(const row of section.rows){const entry=add(row.id,row.shade,row.ld,row.reference);entry.components.push({kind:section.kind,title:section.title,fabricType:row.fabricType,quantities:copyReportData(row.quantities),dyeingType:section.dyeingType,totalPcs:row.totalPcs,totalKg:row.totalKg,weights:copyReportData(row.weights)});entry.qtyKg=row.totalKg===null?null:entry.qtyKg===null?null:productionSum([entry.qtyKg,row.totalKg]);}
    const header=Object.fromEntries(CONFIRMED_HEADER_FIELDS.filter(key=>booking[key]!==undefined).map(key=>[key,booking[key]])),revisionNo=savedReportPlan(original,floor).confirmedSnapshot?.revisionNo ?? revisionNumberFromRows(getReportKnittingRows(original.number,floor));
    const correctionAt=savedReportPlan(original,floor).pmcCorrectionAt;
    const signature=compactCardSignature({header,revisionNo,fabrics:tables.fabrics,entries:Array.from(entries.values()),instructions,...(correctionAt?{pmcCorrectionAt:correctionAt}:{})});
    value=copyReportData({number:original.number,floor,header,fabrics:tables.fabrics,instructions,revisionNo,revisionLabel:confirmedRevisionLabel(original,floor),signature,entries:Array.from(entries.values()),truncated:currentReportBatchRowsTruncated});
  }finally{
    currentViewingNumber=saved.number;currentViewingFloor=saved.floor;currentReportReviewLatest=saved.review;reportDraft=saved.draft;reportRowEditor=saved.editor;currentFabricRows=saved.fabrics;currentBatchRows=saved.batches;currentReportMachineEvaluations=saved.evaluations;currentReportBatchRowsTruncated=saved.truncated;currentComponentSections=saved.components;
  }
  cache.set(floor,{setup:appState.setup,flat:appState.flatAllowance,datasets:appState.datasets,value});return value;
}
function confirmedCardScopes(floor=activeCardFloor){
  const scopes=[];
  for(const booking of getStoredMasterList()){
    if(floor){if(hasOrderOnFloor(booking.number,floor) && reportBookingStatus(booking,floor)==='Confirm')scopes.push({booking,floor});continue;}
    const floors=getOrderFloors(booking.number).filter(key=>reportBookingStatus(booking,key)==='Confirm');
    for(const key of floors)scopes.push({booking,floor:key});
    if(!floors.length && booking.status==='Confirm')scopes.push({booking,floor:null});
  }
  return scopes;
}
function batchCardRevisionReason(card){
  const booking=sourceBooking(card.number);
  if(!booking || reportBookingStatus(booking,card.floor)!=='Confirm')return 'Batch plan is not currently confirmed.';
  const revision=confirmedBatchRevision(booking,card.floor);
  if(revision!==card.revisionNo)return 'Confirmed batch plan revision: '+revisionDisplay(revision)+'; card revision: '+revisionDisplay(card.revisionNo)+'.';
  if(needsReconfirmation(booking,card.floor))return 'Uploaded data changed. Re-confirm the batch plan first.';
  const plan=confirmedCardPlan(booking,card.floor);
  if(!plan.entries.some(entry=>entry.id===card.batchId))return 'This batch is no longer in the confirmed plan.';
  if(plan.signature!==card.planSignature)return 'The confirmed batch plan has changed.';
  return '';
}
function cardReady(booking,floor,plan){return !!plan && !plan.truncated && !needsReconfirmation(booking,floor);}
function selectCardFloor(floor){activeCardFloor=BATCH_FLOORS.some(value=>value.key===floor)?floor:null;cardPage=1;switchMainView('cards');}
function renderCardRegister(){
  currentCardOrder=null;currentCardRecordId=null;
  $('cardRegisterPanel').classList.remove('hidden');$('cardOrderPanel').classList.add('hidden');$('cardPreviewPanel').classList.add('hidden');
  const scopes=confirmedCardScopes(),records=getBatchCards().filter(card=>card.status!=='superseded' && (!activeCardFloor || card.floor===activeCardFloor));
  const completed=records.filter(card=>!batchCardRevisionReason(card)),revisions=records.filter(card=>!!batchCardRevisionReason(card)),partial=[];
  for(const scope of scopes){const plan=confirmedCardPlan(scope.booking,scope.floor),created=new Set(records.filter(card=>normalizeBookingKey(card.number)===normalizeBookingKey(scope.booking.number) && card.floor===scope.floor).map(card=>card.batchId));if(created.size && plan.entries.some(entry=>created.has(entry.id)))for(const entry of plan.entries)if(!created.has(entry.id))partial.push({...scope,plan,entry});}
  $('cardCountPending').textContent=scopes.length;$('cardCountPartial').textContent=partial.length;$('cardCountCompleted').textContent=completed.length;$('cardCountRevision').textContent=revisions.length;
  document.querySelectorAll('[data-card-status]').forEach(button=>button.classList.toggle('active',button.dataset.cardStatus===activeCardStatus));
  document.querySelectorAll('[data-card-floor]').forEach(button=>button.classList.toggle('active',button.dataset.cardFloor===activeCardFloor));
  const counts=new Map();for(const scope of confirmedCardScopes(null))counts.set(scope.floor,(counts.get(scope.floor) || 0)+1);document.querySelectorAll('[data-card-floor-count]').forEach(span=>span.textContent=counts.get(span.dataset.cardFloorCount) || 0);
  let rows=activeCardStatus==='Pending'?scopes:activeCardStatus==='Partial'?partial:activeCardStatus==='Completed'?completed:revisions;
  const search=$('cardSearch').value.trim().toLowerCase();if(search)rows=rows.filter(row=>{const booking=row.booking || row.snapshot?.header || sourceBooking(row.number) || {};return [booking.number,booking.buyer,row.entry?.id,row.batchId].some(value=>String(value || '').toLowerCase().includes(search));});
  const total=rows.length,size=cardPageSize==='All'?Math.max(1,total):Number(cardPageSize),pages=Math.max(1,Math.ceil(total/size));cardPage=Math.max(1,Math.min(cardPage,pages));const visible=cardPageSize==='All'?rows:rows.slice((cardPage-1)*size,cardPage*size);
  $('cardPageInfo').textContent='Page '+cardPage+' of '+pages+' · '+total+' '+(activeCardStatus==='Pending'?'orders':'batches');$('cardPrevious').disabled=cardPage<=1;$('cardNext').disabled=cardPage>=pages;
  const headers=activeCardStatus==='Pending'?['Manage','Order/Booking No.','Floor','Booking Date','Buyer','Confirmed By','Last Save','Cards generated']:activeCardStatus==='Partial'?['Manage','Order/Booking No.','Floor','Buyer','Batch #','Color','Qty (kg)','Flat Qty (pcs)','Revision']:['Manage','Order/Booking No.','Floor','Buyer','Batch #','Color','Generated By','Generated At','Revision',...(activeCardStatus==='Revision' ? ['Reason']:[])];
  const html=visible.map(row=>{
    if(activeCardStatus==='Pending'){
      const booking=getFloorBooking(row.booking,row.floor),plan=confirmedCardPlan(row.booking,row.floor),created=records.filter(card=>normalizeBookingKey(card.number)===normalizeBookingKey(booking.number) && card.floor===row.floor && plan.entries.some(entry=>entry.id===card.batchId)).length;
      return '<tr><td><button class="btn secondary" data-card-order="'+esc(booking.number)+'" data-card-scope="'+esc(row.floor || '')+'">View Batches</button></td>'+[booking.number,floorLabel(row.floor),booking.date,booking.buyer,booking.confirmedBy || '—',lastSaveDisplay(booking.lastSaveAt),created+' / '+plan.entries.length].map(value=>'<td>'+esc(value || '—')+'</td>').join('')+'</tr>';
    }
    if(activeCardStatus==='Partial')return '<tr><td>'+cardGenerateButton(row.booking,row.floor,row.plan,row.entry)+'</td>'+[row.booking.number,floorLabel(row.floor),row.plan.header.buyer,row.entry.id,row.entry.shade,kgText(row.entry.qtyKg),row.entry.components.reduce((sum,component)=>sum+Object.values(component.quantities).reduce((a,b)=>a+b,0),0),revisionDisplay(row.plan.revisionNo)].map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>';
    return '<tr><td><button class="btn secondary" data-card-view="'+esc(row.id)+'">View / Print</button></td>'+[row.number,floorLabel(row.floor),row.snapshot.header.buyer,row.batchId,row.snapshot.entry.shade,row.generatedBy,lastSaveDisplay(row.generatedAt),revisionDisplay(row.revisionNo),...(activeCardStatus==='Revision'?[batchCardRevisionReason(row)]:[])].map(value=>'<td>'+esc(value || '—')+'</td>').join('')+'</tr>';
  });
  if(!html.length)html.push(`<tr><td colspan="${headers.length}" class="placeholder-cell">No matching ${activeCardStatus==='Pending'?'confirmed orders':'batches'}.</td></tr>`);
  $('cardRegisterTable').innerHTML=table(headers,html,'grid-table card-list-table');
  $('cardScopeLabel').textContent='Batch Card · '+floorLabel(activeCardFloor)+' · Confirmed plans are read-only here. Pending shows confirmed orders; Partial lists ungenerated batches from orders with cards already generated.';
}
function cardGenerateButton(booking,floor,plan,entry){
  const ready=cardReady(booking,floor,plan);
  return `<button class="btn success" data-card-generate="${esc(entry.id)}" data-card-number="${esc(booking.number)}" data-card-scope="${esc(floor || '')}" data-card-blocked="${!ready}" ${ready?'':'disabled'}>${ready?'Generate Card':'Re-confirm plan first'}</button>`;
}
function openCardOrder(number,floor){
  const booking=sourceBooking(number),plan=confirmedCardPlan(booking,floor);if(!plan)return;
  currentCardOrder={number:booking.number,floor};$('cardRegisterPanel').classList.add('hidden');$('cardPreviewPanel').classList.add('hidden');$('cardOrderPanel').classList.remove('hidden');
  const rows=plan.entries.map(entry=>{const card=getBatchCards().find(card=>normalizeBookingKey(card.number)===normalizeBookingKey(booking.number) && card.floor===floor && card.batchId===entry.id && card.status!=='superseded');return '<tr><td>'+(card?`<button class="btn secondary" data-card-view="${esc(card.id)}">${batchCardRevisionReason(card)?'Revision Pending':'View / Print'}</button>`:cardGenerateButton(booking,floor,plan,entry))+'</td>'+[entry.id,entry.shade,entry.machineLabel || '—',kgText(entry.qtyKg),entry.components.reduce((sum,component)=>sum+Object.values(component.quantities).reduce((a,b)=>a+b,0),0),card?'Generated':'Not generated'].map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>';});
  $('cardOrderContent').innerHTML=`<h2>Order / Booking No: ${esc(booking.number)} · ${esc(floorLabel(floor))}</h2><p>${esc(plan.header.buyer)} · ${esc(revisionLabel(plan.revisionNo) || 'Revision not provided')}</p>${needsReconfirmation(booking,floor)?'<p class="batch-calculation-note">New uploaded data requires batch plan re-confirmation before generating or revising cards.</p>':''}${table(['Manage','Batch #','Color','Dyeing M/C','Total batch Qty (kg)','Flat Qty (pcs)','Card status'],rows.length?rows:['<tr><td colspan="7">No confirmed batches available.</td></tr>'],'grid-table card-list-table')}`;
}
async function generateBatchCard(number,floor,batchId){
  if(!canChangeData())return false;
  const booking=sourceBooking(number),plan=confirmedCardPlan(booking,floor);if(!cardReady(booking,floor,plan)){toast('Re-confirm the latest batch plan before generating this card.');return false;}
  const entry=plan.entries.find(entry=>entry.id===batchId);if(!entry){toast('This batch is not in the confirmed plan.');return false;}
  const records=copyReportData(getBatchCards()),index=records.findIndex(card=>card.id===cardKey(number,floor,batchId)),old=index>=0?records[index]:null;
  if(old && old.status!=='superseded' && !batchCardRevisionReason(old)){openBatchCard(old.id);return true;}
  const history=old?[...(old.history || []),Object.fromEntries(Object.entries(old).filter(([key])=>key!=='history'))]:[];
  const used=plan.fabrics.filter(fabric=>entry.bodyRows.some(row=>(row.quantities[fabric.key] || 0)>0));
  const record={id:cardKey(number,floor,batchId),number:booking.number,floor,batchId,revisionNo:plan.revisionNo,planSignature:plan.signature,version:(old?.version || 0)+1,generatedBy:currentUsername(),generatedAt:new Date().toISOString(),status:'active',history,
    snapshot:copyReportData({factory:reportFactoryName(floor),header:plan.header,revisionLabel:plan.revisionLabel || revisionLabel(plan.revisionNo),entry,fabrics:used,instructions:plan.instructions})};
  if(index>=0)records[index]=record;else records.push(record);
  setMutationBusy(true);try{await commitChanges({cards:records});renderCardRegister();openBatchCard(record.id);toast(old?'Revised batch card generated.':'Batch card generated.');return true;}catch(error){showSaveError(error);return false;}finally{setMutationBusy(false);}
}
function batchCardHtml(card){
  const {header,entry,fabrics,instructions,factory}=card.snapshot;
  const quantities=fabrics.map(fabric=>entry.bodyRows.reduce((sum,row)=>sum+(row.quantities[fabric.key] || 0),0));
  const fabricRows=Array.from({length:Math.max(4,fabrics.length)},(_,index)=>{const fabric=fabrics[index];return `<tr><td>${fabric?esc([fabric.yarn,fabric.type,fabric.gaugeDia].filter(Boolean).join(' · ')):''}</td><td></td><td></td><td>${esc(fabric?.width || '')}</td><td>${esc(fabric?.gsm || '')}</td><td>${fabric?esc(kgText(quantities[index])):''}</td>${index===0?`<td rowspan="${Math.max(4,fabrics.length)}">${entry.qtyKg?esc(kgText(entry.qtyKg)):''}</td>`:''}</tr>`;}).join('');
  const dry=Array.from(new Set(fabrics.map(fabric=>fabric.dryMethod).filter(Boolean))).join(', '),remarks=fabrics.map(fabric=>fabric.remarks || '').join(', ');
  const process=(a,b,c,d,e,f)=>'<tr>'+[a,b,c,d,e,f].map(value=>'<td>'+esc(value || '')+'</td>').join('')+'</tr>';
  const history=['Batch Prep.','RP. Batch','Heat Set','Benninger','Steaming','Singeing','De-Watering','Slitting','Drying','Stentering 1st','Stentering 2nd','Peach','Brush','Shearing','Compacting','Sanforizing'];
  const fabricTypes=['Body','Tube','C&C WT','TT','DC','TW','Sp Rib','Non Rib','Other B.N','','','','','','','Total'];
  const route=history.map((label,index)=>`<tr><td>${esc(fabricTypes[index])}</td><td>${index===0 && entry.qtyKg?esc(kgText(entry.qtyKg)):index===15 && entry.qtyKg?esc(kgText(entry.qtyKg)):''}</td><td>${esc(label)}</td>${Array(5).fill('<td></td>').join('')}${index===0?'<td rowspan="4" class="handwriting-box">Batch Remarks</td>':index===4?'<td rowspan="4" class="handwriting-box">Dyeing Remarks</td>':index===8?'<td rowspan="8" class="handwriting-box">Finishing Remarks</td>':''}</tr>`).join('');
  const components=entry.components.length?'<table class="card-components"><thead><tr><th>Component</th><th>FabricType</th><th>Dyeing Type</th><th>Size-wise planned pieces</th></tr></thead><tbody>'+entry.components.map(component=>'<tr><td>'+esc(component.kind)+'</td><td>'+esc(component.fabricType)+'</td><td>'+esc(component.dyeingType)+'</td><td>'+Object.entries(component.quantities).sort(([a],[b])=>compareComponentSizes(componentSize({CCSize:a}),componentSize({CCSize:b}))).map(([size,qty])=>esc(size+': '+qty+' pcs')).join('; ')+'</td></tr>').join('')+'</tbody></table>':'';
  return `<article class="batch-process-card"><header><h1>${esc(factory)}</h1><h2>BATCH PROCESS CARD</h2><div class="card-version">${esc(card.snapshot.revisionLabel || 'Revision not provided')} · Card version ${card.version}</div></header>
    <table class="card-process"><tbody><tr><th>Dyeing M/C</th><td colspan="3">${esc(entry.machineLabel)}</td><th>MRS No:</th><td></td></tr><tr><th colspan="4">Batch Process Instruction</th><th>Line / Tumble Dry</th><td>${esc(dry)}</td></tr>
    ${process('Open','Bag Sewing','','Heat Set',header.heatset || (/heatset/i.test(remarks)?'Heatset':''),'')}
    ${process('Tube','Turning','','Brush',header.brush || (/brush/i.test(remarks)?'Brush':''),'')}
    ${process('Roll (Pipe)','Slitting','','Peach',header.peach || (/peach/i.test(remarks)?'Peach':''),'')}
    ${process('Dyeing Face (Fabric Top/Back)','','Singeing','','Wash / Non Wash','')}
    ${process('Steaming','','AOP','','Pluvia Wash',card.floor==='PLUVIA'?'Pluvia':'')}
    </tbody></table>
    <table class="card-fabrics"><thead><tr><th rowspan="2" style="width:42%">Yarn Type + Fabric Type + M/C Gage Dia</th><th colspan="2">Grey Fabric</th><th colspan="2">Finished Fabric</th><th rowspan="2">QTY (kg)</th><th rowspan="2">Total (kg)</th></tr><tr><th>Width</th><th>GSM</th><th>Width</th><th>GSM</th></tr></thead><tbody>${fabricRows}</tbody></table>
    <table class="card-identification"><tbody><tr><th>Customer</th><td>${esc(header.buyer)}</td><th>LAB Dip</th><td>${esc(entry.ld)}</td><th>Check Point</th><th>Shade</th><th>Hairy</th><th>Hand Feel</th><th>Wash Fastness</th><th>Wet Rubbing</th></tr><tr><th>W.Order</th><td>${esc(card.number)}</td><th>Dyeing Date</th><td></td>${Array(6).fill('<td></td>').join('')}</tr><tr><th>Batch No</th><td>${esc(entry.id)}</td><th>Time In</th><td></td><td colspan="6" rowspan="2" class="handwriting-box">Check &amp; Comment by Dyeing</td></tr><tr><th>Shade</th><td>${esc(entry.shade)}</td><th>Time Out</th><td></td></tr></tbody></table>
    ${components}${instructions.length?'<div class="card-written-instructions"><strong>Instruction:</strong> '+instructions.map(row=>esc(row.serial+'. '+row.details)).join(' · ')+'</div>':''}
    <table class="card-history"><thead><tr><th>Fabric Type</th><th>QTY (kg)</th><th>History</th><th>M/C</th><th>Date</th><th>Shift</th><th>Sign</th><th>Time</th><th style="width:33%">Remarks</th></tr></thead><tbody>${route}</tbody></table>
    <table class="card-quality"><tr><th>Inspection / Quality Remarks</th></tr><tr><td class="handwriting-box">Quality Remarks</td></tr></table>
    <footer>Generated by ${esc(card.generatedBy)} · ${esc(lastSaveDisplay(card.generatedAt))} · ${esc(floorLabel(card.floor))}</footer></article>`;
}
function openBatchCard(id){
  const card=getBatchCards().find(card=>card.id===id);if(!card)return;
  currentCardRecordId=id;$('cardRegisterPanel').classList.add('hidden');$('cardOrderPanel').classList.add('hidden');$('cardPreviewPanel').classList.remove('hidden');
  const reason=batchCardRevisionReason(card),booking=sourceBooking(card.number),plan=confirmedCardPlan(booking,card.floor),entry=plan?.entries.find(entry=>entry.id===card.batchId),canRevise=reason && entry && cardReady(booking,card.floor,plan);
  $('cardRevisionNotice').textContent=reason ? 'Revision Pending: '+reason : 'Completed · Generated card is saved as a snapshot.';
  $('cardRevisionActions').innerHTML=canRevise?`<button class="btn success" data-card-generate="${esc(card.batchId)}" data-card-number="${esc(card.number)}" data-card-scope="${esc(card.floor || '')}">Generate Revised Card</button>`:reason && !entry && cardReady(booking,card.floor,plan)?`<button class="btn secondary" data-card-retire="${esc(card.id)}">Mark Superseded</button>`:'';
  $('batchCardPrintView').innerHTML=batchCardHtml(card);
}
async function retireBatchCard(id){
  if(!canChangeData())return false;const records=copyReportData(getBatchCards()),record=records.find(card=>card.id===id);if(!record)return false;
  const plan=confirmedCardPlan(sourceBooking(record.number),record.floor);if(!plan || plan.entries.some(entry=>entry.id===record.batchId)){toast('Only a batch removed from the latest confirmed plan can be marked superseded.');return false;}
  record.status='superseded';setMutationBusy(true);try{await commitChanges({cards:records});renderCardRegister();toast('Previous card retained as superseded.');return true;}catch(error){showSaveError(error);return false;}finally{setMutationBusy(false);}
}
$('navBatchCard').addEventListener('click',()=>selectCardFloor(null));
$('cardFloorSubmenus').addEventListener('click',event=>{const button=event.target.closest('[data-card-floor]');if(button)selectCardFloor(button.dataset.cardFloor);});
$('batchCardView').addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.cardStatus){activeCardStatus=button.dataset.cardStatus;cardPage=1;renderCardRegister();}
  if(button.hasAttribute('data-card-order'))openCardOrder(button.dataset.cardOrder,button.dataset.cardScope || null);
  if(button.hasAttribute('data-card-view'))openBatchCard(button.dataset.cardView);
  if(button.hasAttribute('data-card-generate'))generateBatchCard(button.dataset.cardNumber,button.dataset.cardScope || null,button.dataset.cardGenerate);
  if(button.hasAttribute('data-card-retire'))retireBatchCard(button.dataset.cardRetire);
});
$('cardSearch').addEventListener('input',()=>{cardPage=1;renderCardRegister();});
$('cardPageSize').addEventListener('change',event=>{cardPageSize=event.target.value;cardPage=1;renderCardRegister();});
$('cardPrevious').addEventListener('click',()=>{cardPage--;renderCardRegister();});$('cardNext').addEventListener('click',()=>{cardPage++;renderCardRegister();});
$('btnCardBack').addEventListener('click',renderCardRegister);$('btnCardOrderBack').addEventListener('click',renderCardRegister);
$('btnPrintBatchCard').addEventListener('click',()=>{document.body.classList.add('printing-batch-card');try{window.print();}finally{document.body.classList.remove('printing-batch-card');}});


/* Dyeable Batch reads approved Colour & Batch Info rows. Production is allocated
   over each complete saved sequence before report filters are applied. */
let dyeableReportResult=null,dyeableFilterContext=null,dyeableExportBusy=false;
const DYEABLE_ALL='__all__',DYEABLE_UNASSIGNED='__unassigned__';
const DYEABLE_FILTER_IDS={knit:'dyeableKnit',labdip:'dyeableLabdip',buyer:'dyeableBuyer',floor:'dyeableFloor',machine:'dyeableMachine'};
let dyeableReportMode='detail',dyeableSummaryResult=null;
const DYEABLE_FLOOR_LABELS={EFL:'EFL',EKL:'EKL',EXT:'Ext',PLUVIA:'Pluvia',OUTSIDE:'Outside'};
let dyeableReportFilters={knit:DYEABLE_ALL,labdip:DYEABLE_ALL,buyer:DYEABLE_ALL,floor:DYEABLE_ALL,machine:DYEABLE_ALL};
let dyeableSummaryFilters={...dyeableReportFilters};
function generalInfoBuyer(row) {
  for(const [key,value] of Object.entries(row || {}))if(['buyer','buyername'].includes(key.toLowerCase().replace(/[^a-z0-9]/g,'')) && String(value ?? '').trim())return String(value).trim();
  return '';
}
function dyeableBuyerChoices() {
  const choices=new Map();
  for(const row of Object.values(getStoredDatasets().genInfo || {})){
    const buyer=generalInfoBuyer(row);if(buyer && !choices.has(constructionKey(buyer)))choices.set(constructionKey(buyer),buyer);
  }
  return Array.from(choices.values()).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function dyeableConfirmedScopes() {
  const scopes=[];
  for(const booking of getStoredMasterList()){
    if(booking.status==='Confirm' && booking.confirmedSnapshot){
      // A whole-order confirmation owns its complete approved sequence. Imports
      // can create inherited floor records; they must not replace or duplicate it.
      const sourceFloors=new Set((booking.confirmedSnapshot.sourceRows || []).map(knittingRowFloor).filter(Boolean));
      scopes.push({booking,floor:null,filterFloor:sourceFloors.size===1?Array.from(sourceFloors)[0]:null});continue;
    }
    const floors=BATCH_FLOORS.map(floor=>floor.key).filter(floor=>booking.floorPlans?.[floor]?.status==='Confirm');
    for(const floor of floors)scopes.push({booking,floor,filterFloor:floor});
    // Older plans confirmed from All Orders have one saved report, not a newly
    // generated copy for every floor. Include that approved sequence only once.
    if(!floors.length && booking.status==='Confirm'){
      const sourceFloors=new Set((booking.confirmedSnapshot?.sourceRows || []).map(knittingRowFloor).filter(Boolean));
      scopes.push({booking,floor:null,filterFloor:sourceFloors.size===1?Array.from(sourceFloors)[0]:null});
    }
  }
  return scopes;
}
function dyeableMachineLabel(value) {
  if(typeof value==='string')return value.trim();
  if(!value || typeof value!=='object')return '';
  const label=String(value.label || value.machineLabel || '').trim();if(label)return label;
  const brand=String(value.mcBrand ?? '').trim(),number=String(value.mcNo ?? '').trim();return brand || number?brand+'-'+number:'';
}
function savedDyeableMachineDetails(row,data,saved,totalKg) {
  if(row.assignmentError && !dyeableMachineLabel(row.machineLabel) && !dyeableMachineLabel(row.machine))return {machine:'',loading:'',nozzle:'',machineRecovered:false,machineNote:String(row.assignmentError)};
  const has=value=>value!==null && value!==undefined && String(value).trim()!=='';
  const same=other=>String(other.id ?? other.batchNo ?? '')===String(row.id) && (!other.shade || colourSelectionKey(other.shade)===colourSelectionKey(row.shade));
  const legacy=(saved.batches || []).find(same),groups=(data.evaluations || []).filter(value=>colourSelectionKey(value.shade)===colourSelectionKey(row.shade));
  const group=groups.find(value=>value.sourceRows?.some(same)) || groups.find(value=>machineEvaluationKey(value)===machineEvaluationKey(row)) || (groups.length===1?groups[0]:null);
  const source=group?.sourceRows?.find(same);
  const machineId=row.machineId ?? source?.machineId ?? null;
  let config=machineId!==null?(group?.rows || []).find(value=>String(value.id ?? value.machine?.id)===String(machineId)):null;
  const existingLabel=dyeableMachineLabel(row.machineLabel) || dyeableMachineLabel(row.machine) || dyeableMachineLabel(source?.machineLabel) || dyeableMachineLabel(source?.machine);
  if(!config && existingLabel)config=(group?.rows || []).find(value=>constructionKey(dyeableMachineLabel(value.machine))===constructionKey(existingLabel));
  // Recover an applied configuration only when older source rows have no row
  // assignments. A deliberately unassigned row in a mixed group stays unassigned.
  if(!config && !existingLabel){
    const applied=(group?.rows || []).filter(value=>value.applied===true);
    const assignedSource=group?.sourceRows?.some(value=>has(value.machineId) || dyeableMachineLabel(value.machineLabel) || dyeableMachineLabel(value.machine));
    if(applied.length===1 && !assignedSource)config=applied[0];
  }
  const machine=[row.machine,source?.machine,legacy?.machine,config?.machine].find(value=>value && typeof value==='object');
  const label=existingLabel || dyeableMachineLabel(legacy?.machineLabel) || dyeableMachineLabel(legacy?.machine) || dyeableMachineLabel(machine);
  const capacity=[row.machineCapacityKg,row.machineCapacity,machine?.capacityKg,machine?.capacity,config?.capacityKg].map(fabricQuantity).find(value=>value>0);
  let loading=[row.loading,source?.loading,legacy?.loading].find(has),nozzle=[row.nozzle,source?.nozzle,legacy?.nozzle].find(has);
  if(!has(loading) && label && capacity>0 && totalKg!==null)loading=String(Number((totalKg/capacity*100).toFixed(2)))+'%';
  if(!has(nozzle) && label && capacity>0)nozzle=machineNozzles(capacity);
  return {machine:label,loading:has(loading)?String(loading):'',nozzle:has(nozzle)?String(nozzle):'',machineRecovered:!!label && (!dyeableMachineLabel(row.machineLabel) || !has(row.loading) || !has(row.nozzle))};
}
function collectDyeableBatches() {
  const result=[],warnings=[];
  const generalInfo=new Map(Object.entries(getStoredDatasets().genInfo || {}).map(([key,value])=>[normalizeBookingKey(key),value]));
  for(const {booking,floor,filterFloor} of dyeableConfirmedScopes()){
    const saved=savedReportPlan(booking,floor),data=saved.confirmedSnapshot?.reportData || captureConfirmedReport(booking,floor,{useDraft:false});
    const fabrics=data.fabrics || [],rows=data.rows || [],components=data.components || [];
    const readiness=evaluateKnittingReadiness(booking,floor,fabrics,rows,components);
    const componentQuantities=componentFabricDisplayQuantities(rows,fabrics,booking,floor,components);
    const buyer=generalInfoBuyer(generalInfo.get(normalizeBookingKey(booking.number))) || saved.confirmedSnapshot?.headerData?.buyer || booking.buyer || '';
    if(data.truncated)warnings.push('Order '+booking.number+(floor?' · '+floorLabel(floor):'')+': the confirmed report contains a limited batch sequence. Only saved rows are included.');
    rows.forEach((row,index)=>{
      const quantities=fabrics.map(fabric=>{
        const value=fabric.componentKind?componentQuantities.get(JSON.stringify([String(row.id),colourSelectionKey(row.shade),fabric.key])):row.quantities?.[fabric.key];
        return {quantity:value===null?null:fabricQuantity(value) || 0,type:fabric.type || '',gsm:fabric.gsm || '',componentKind:fabric.componentKind || ''};
      });
      const totalKg=row.totalKg===null?null:fabricQuantity(row.totalKg) ?? (quantities.some(value=>value.quantity===null)?null:productionSum(quantities.map(value=>value.quantity || 0)));
      const details=savedDyeableMachineDetails(row,data,saved,totalKg);
      result.push({number:booking.number,floor:filterFloor,id:String(row.id ?? ''),shade:String(row.shade ?? ''),ld:String(row.ld ?? ''),reference:String(row.reference ?? ''),buyer:String(buyer),
        fabrics:quantities,totalKg,fabrication:quantities.filter(value=>value.quantity===null || value.quantity>0).map(value=>value.type).filter(Boolean).join('-'),
        knit:readiness[index],...details,revision:revisionLabel(saved.confirmedSnapshot?.revisionNo) || ''});
    });
  }
  return {rows:result,warnings};
}
function dyeableFilterIsAll(value) {return value===DYEABLE_ALL || value===undefined || value===null;}
function dyeableFilterMatches(value,item) {return dyeableFilterIsAll(value) || (Array.isArray(value)?value:[value]).includes(item);}
function dyeableMachineKey(row) {return constructionKey(row.machine) || DYEABLE_UNASSIGNED;}
function filterDyeableBatches(source,filters) {
  const rows=source.rows.filter(row=>dyeableFilterMatches(filters.floor,row.floor) && dyeableFilterMatches(filters.buyer,constructionKey(row.buyer)) && dyeableFilterMatches(filters.machine,dyeableMachineKey(row)) &&
    dyeableFilterMatches(filters.labdip,row.ld.trim()?'Yes':'No') && dyeableFilterMatches(filters.knit,row.knit?.kind==='ready'?'Knit ok':'Not Knit ok'));
  return {rows,warnings:source.warnings.slice(),filters:copyReportData(filters),fabricCount:rows.reduce((count,row)=>Math.max(count,row.fabrics.length),1),generatedAt:new Date().toISOString()};
}

function dyeableMultiOptions(key,choices,selected=DYEABLE_ALL) {
  const all=dyeableFilterIsAll(selected),values=new Set(all?choices.map(([value])=>value):(Array.isArray(selected)?selected:[selected]).filter(value=>choices.some(([option])=>option===value)));
  dyeableFilterContext.selections[key]={all,values,choices};
  const id=DYEABLE_FILTER_IDS[key],container=$(id).querySelector('.dyeable-multi-options');
  container.innerHTML=[[DYEABLE_ALL,'All'],...choices].map(([value,label])=>'<label><input type="checkbox" data-dyeable-key="'+key+'" data-dyeable-choice="'+esc(value)+'">'+esc(label)+'</label>').join('');
  syncDyeableMulti(key);
}
function dyeableMultiValue(key) {
  const state=dyeableFilterContext?.selections[key];
  return !state || state.all?DYEABLE_ALL:Array.from(state.values);
}
function syncDyeableMulti(key) {
  const state=dyeableFilterContext?.selections[key];if(!state)return;
  const root=$(DYEABLE_FILTER_IDS[key]),labels=state.choices.filter(([value])=>state.values.has(value)).map(([,label])=>label);
  root.querySelector('[data-multi-caption]').textContent=state.all?'All':!labels.length?'None':labels.length<=2?labels.join(', '):labels.length+' selected';
  root.querySelectorAll('[data-dyeable-choice]').forEach(input=>{
    const all=input.dataset.dyeableChoice===DYEABLE_ALL;
    input.checked=all?state.all:state.all || state.values.has(input.dataset.dyeableChoice);
    if(all)input.indeterminate=!state.all && state.values.size>0;
  });
}
function updateDyeableMachineChoices() {
  if(!dyeableFilterContext)return;
  const floors=dyeableMultiValue('floor'),previous=dyeableMultiValue('machine'),choices=new Map();
  const add=value=>{const label=String(value ?? '').trim();if(label && label!=='-' && !choices.has(constructionKey(label)))choices.set(constructionKey(label),label);};
  const floorAllowed=floor=>dyeableFilterMatches(floors,floor);
  for(const machine of getMachineSetup())if(String(machine.mcType || '').trim().toUpperCase()==='BULK' && (dyeableFilterIsAll(floors) || (Array.isArray(floors)?floors:[floors]).some(floor=>machineFloorsForMenu(floor).includes(normalizeFloor(machine.floor)))))add(String(machine.mcBrand ?? '').trim()+'-'+String(machine.mcNo ?? '').trim());
  for(const row of dyeableFilterContext.source.rows)if(floorAllowed(row.floor)){if(row.machine)add(row.machine);else choices.set(DYEABLE_UNASSIGNED,'Not assigned');}
  dyeableMultiOptions('machine',Array.from(choices,([key,label])=>[key,label]).sort((a,b)=>a[1].localeCompare(b[1],undefined,{numeric:true})),previous);
}
function openDyeableFilters(mode='detail') {
  mode=mode==='summary'?'summary':'detail';
  if(!storageReady){toast('Wait until saved data is ready before opening the report.');return false;}
  if(mutationBusy){toast('Please wait for the current save to finish.');return false;}
  try{
    const filters=mode==='summary'?dyeableSummaryFilters:dyeableReportFilters;
    dyeableFilterContext={source:collectDyeableBatches(),returnFocus:document.activeElement,mode,selections:{}};
    dyeableMultiOptions('knit',[['Knit ok','Knit ok'],['Not Knit ok','Not Knit ok']],filters.knit);
    dyeableMultiOptions('labdip',[['Yes','Yes'],['No','No']],filters.labdip);
    dyeableMultiOptions('buyer',dyeableBuyerChoices().map(buyer=>[constructionKey(buyer),buyer]),filters.buyer);
    dyeableMultiOptions('floor',Object.entries(DYEABLE_FLOOR_LABELS),filters.floor);
    dyeableFilterContext.selections.machine={all:dyeableFilterIsAll(filters.machine),values:new Set(Array.isArray(filters.machine)?filters.machine:dyeableFilterIsAll(filters.machine)?[]:[filters.machine]),choices:[]};
    updateDyeableMachineChoices();$('dyeableFilterError').textContent='';
    $('dyeableFiltersTitle').textContent=(mode==='summary'?'Dyeable Batch Summary':'Dyeable Batch')+' · Report Filters';
    for(const id of Object.values(DYEABLE_FILTER_IDS))$(id).open=false;
    $('dyeableFiltersDialog').classList.remove('hidden');$('dyeableFiltersDialog').setAttribute('aria-hidden','false');$('dyeableKnit').querySelector('summary').focus();return true;
  }catch(error){dyeableFilterContext=null;toast('Could not prepare the report: '+error.message);return false;}
}
function closeDyeableFilters(restoreFocus=true) {
  const context=dyeableFilterContext;dyeableFilterContext=null;
  $('dyeableFiltersDialog').classList.add('hidden');$('dyeableFiltersDialog').setAttribute('aria-hidden','true');
  for(const id of Object.values(DYEABLE_FILTER_IDS))$(id).open=false;
  if(context && restoreFocus)context.returnFocus?.focus();
}
function previewDyeableReport() {
  if(!dyeableFilterContext || !storageReady || mutationBusy)return false;
  const filters=Object.fromEntries(Object.keys(DYEABLE_FILTER_IDS).map(key=>[key,dyeableMultiValue(key)])),mode=dyeableFilterContext.mode;
  try{
    const result=filterDyeableBatches(collectDyeableBatches(),filters);
    dyeableReportMode=mode;
    if(mode==='summary'){dyeableSummaryFilters=filters;dyeableSummaryResult=result;$('dyeableSummaryExportStatus').textContent='';}
    else{dyeableReportFilters=filters;dyeableReportResult=result;$('dyeableExportStatus').textContent='';}
    switchMainView('reports');renderDyeableReport();return true;
  }catch(error){$('dyeableFilterError').textContent='Could not preview the report: '+error.message;return false;}
}
function dyeableFilterSummary(filters) {
  const buyers=new Map(dyeableBuyerChoices().map(value=>[constructionKey(value),value]));
  const machines=new Map([...(dyeableReportResult?.rows || []),...(dyeableSummaryResult?.rows || [])].filter(row=>row.machine).map(row=>[constructionKey(row.machine),row.machine]));
  const label=(value,key)=>{
    if(dyeableFilterIsAll(value))return 'All';
    const values=Array.isArray(value)?value:[value];
    return values.length?values.map(item=>key==='floor'?DYEABLE_FLOOR_LABELS[item] || item:key==='buyer'?buyers.get(item) || item:key==='machine'?(item===DYEABLE_UNASSIGNED?'Not assigned':machines.get(item) || item):item).join(', '):'None';
  };
  return Object.entries({knit:'Knit Status',labdip:'Labdip',buyer:'Buyer',floor:'Floor',machine:'MC Number'}).map(([key,title])=>title+': '+label(filters[key],key)).join(' · ');
}

function dyeableReportHeaders(count) {
  return ['Batch #','Shade','Lapdip Number','Reference','Buyer',...Array.from({length:count},(_,index)=>'Fabric '+(index+1)),'Total batch Qty (kg)','Fabrication','Knit Status','Loading','M/C nozzle','MC Number'];
}
function renderDyeableReport() {
  if(dyeableReportMode==='daily'){renderDailyConfirmReport();return;}
  $('dailyConfirmPanel').classList.add('hidden');
  if(dyeableReportMode==='summary'){renderDyeableSummary();return;}
  $('dyeableSummaryPanel').classList.add('hidden');
  const result=dyeableReportResult;
  $('dyeableReportEmpty').classList.toggle('hidden',!!result);$('dyeableReportPanel').classList.toggle('hidden',!result);
  if(!result)return;
  const count=result.fabricCount,headers=dyeableReportHeaders(count);
  $('dyeableReportFilterSummary').textContent=dyeableFilterSummary(result.filters);
  const total=productionSum(result.rows.map(row=>row.totalKg || 0)),missing=result.rows.filter(row=>row.totalKg===null).length;
  $('dyeableReportCount').textContent=result.rows.length+' batches · '+new Set(result.rows.map(row=>row.number)).size+' orders · '+kgText(total)+' kg'+(missing?' + '+missing+' batch weight(s) missing':'');
  $('dyeableReportAsOf').textContent='Preview: '+lastSaveDisplay(result.generatedAt);
  const warnings=result.warnings.slice(),unassigned=result.rows.filter(row=>!row.machine).length;
  if(unassigned)warnings.push(unassigned+' batch(es) have no saved machine assignment. MC Number is shown as Not assigned; unavailable loading/nozzle values are labelled Not available.');
  $('dyeableReportWarnings').textContent=warnings.join(' ');
  $('dyeableReportWarnings').classList.toggle('hidden',!warnings.length);
  $('btnDownloadDyeable').disabled=!result.rows.length || dyeableExportBusy;
  const widths=[130,145,120,145,150,...Array(count).fill(90),125,240,205,85,90,150];
  $('dyeableReportTable').innerHTML='<table class="dyeable-table" style="min-width:'+widths.reduce((a,b)=>a+b,0)+'px"><colgroup>'+widths.map(width=>'<col style="width:'+width+'px">').join('')+'</colgroup><thead><tr>'+headers.map(header=>'<th>'+esc(header)+'</th>').join('')+'</tr></thead><tbody>'+(
    result.rows.length?result.rows.map(row=>'<tr><td title="'+esc('Order '+row.number+' · '+(DYEABLE_FLOOR_LABELS[row.floor] || 'All floors')+' · '+row.revision)+'"><strong>'+esc(row.id)+'</strong></td><td>'+esc(row.shade)+'</td><td>'+esc(row.ld)+'</td><td>'+esc(row.reference)+'</td><td>'+esc(row.buyer)+'</td>'+Array.from({length:count},(_,index)=>{
      const fabric=row.fabrics[index],quantity=fabric?.quantity;
      return '<td class="dyeable-numeric" title="'+esc(fabric?(fabric.type+(fabric.gsm?' · GSM '+fabric.gsm:'')):'')+'">'+(quantity===null?'Weight missing':quantity?esc(kgText(quantity)):'')+'</td>';
    }).join('')+'<td class="dyeable-numeric">'+(row.totalKg===null?'Weight missing':esc(kgText(row.totalKg)))+'</td><td>'+esc(row.fabrication)+'</td><td>'+knittingBadge(row.knit,true)+'</td><td class="dyeable-numeric">'+esc(row.loading || 'Not available')+'</td><td class="dyeable-numeric">'+esc(row.nozzle || 'Not available')+'</td><td title="'+esc(row.machineNote || (row.machineRecovered?'Recovered from saved machine details.':row.machine?'Saved machine assignment.':'No saved machine assignment.'))+'">'+esc(row.machine || 'Not assigned')+'</td></tr>').join(''):'<tr><td colspan="'+headers.length+'" class="dyeable-empty-cell">No confirmed batches match these filters.</td></tr>')+'</tbody></table>';
}
function buildDyeableWorkbook(reader,result) {
  const headers=dyeableReportHeaders(result.fabricCount);
  const values=[headers,...result.rows.map(row=>{
    const percentage=fabricQuantity(row.loading.replace(/%\s*$/,''));
    return [row.id,row.shade,row.ld,row.reference,row.buyer,...Array.from({length:result.fabricCount},(_,index)=>{
      const fabric=row.fabrics[index];return !fabric?'':fabric.quantity===null?'Weight missing':fabric.quantity;
    }),row.totalKg===null?'Weight missing':row.totalKg,row.fabrication || '',row.knit?.label || '',percentage===null?'Not available':percentage/100,fabricQuantity(row.nozzle) ?? (row.nozzle || 'Not available'),row.machine || 'Not assigned'];
  })];
  const sheet=reader.utils.aoa_to_sheet(values),count=result.fabricCount;
  sheet['!cols']=[{wch:19},{wch:23},{wch:19},{wch:24},{wch:24},...Array.from({length:count},()=>({wch:15})),{wch:24},{wch:46},{wch:44},{wch:14},{wch:15},{wch:25}];
  sheet['!rows']=[{hpt:30}];sheet['!autofilter']={ref:sheet['!ref']};
  for(let row=1;row<values.length;row++){
    for(let col=5;col<=5+count;col++){
      const cell=sheet[reader.utils.encode_cell({r:row,c:col})];if(cell?.t==='n')cell.z='#,##0.000';
    }
    const loading=sheet[reader.utils.encode_cell({r:row,c:8+count})];if(loading?.t==='n')loading.z='0.00%';
  }
  const workbook=reader.utils.book_new();reader.utils.book_append_sheet(workbook,sheet,'Dyeable Batch');
  workbook.Props={Title:'Dyeable Batch',Subject:dyeableFilterSummary(result.filters),Author:currentUsername()};return workbook;
}
async function downloadDyeableReport(mode='detail') {
  mode=mode==='summary'?'summary':'detail';
  const summary=mode==='summary',result=summary?dyeableSummaryResult:dyeableReportResult,button=$(summary?'btnDownloadDyeableSummary':'btnDownloadDyeable'),status=$(summary?'dyeableSummaryExportStatus':'dyeableExportStatus');
  if(dyeableExportBusy || !result || !summary && !result.rows.length)return false;
  dyeableExportBusy=true;button.disabled=true;status.textContent='Preparing Excel…';
  try{
    const reader=await ensureExcelReader(),workbook=summary?buildDyeableSummaryWorkbook(reader,result):buildDyeableWorkbook(reader,result);
    const filename=(summary?'Dyeable_Batch_Summary_':'Dyeable_Batch_')+result.generatedAt.replace(/[-:]/g,'').replace('T','_').slice(0,15)+'.xlsx';
    reader.writeFile(workbook,filename,{bookType:'xlsx',compression:true});status.textContent='Excel download prepared.';return true;
  }catch(error){status.textContent='Excel download failed: '+error.message+'. Your report is still available; try again.';return false;}
  finally{dyeableExportBusy=false;$('btnDownloadDyeable').disabled=!dyeableReportResult?.rows.length;$('btnDownloadDyeableSummary').disabled=!dyeableSummaryResult;}
}
const DYEABLE_SUMMARY_CRITERIA=['Knit Ok, Labdip Ok','Knit Ok, Labdip Pending','Knit Balance, Labdip ok'];
function dyeableFloorTotalLabel(floor){return floor.label+(['EFL','EKL','EXT'].includes(floor.floor)?' Floor':'')+' Total';}
function emptyDyeableSummaryCells(){return Array.from({length:3},()=>({count:0,quantity:0,missing:0}));}
function dyeableSummaryCriterion(row){return row.knit?.kind==='ready'?(row.ld.trim()?0:1):row.ld.trim()?2:-1;}
function buildDyeableSummary(result) {
  const selectedFloors=Object.keys(DYEABLE_FLOOR_LABELS).filter(floor=>dyeableFilterMatches(result.filters.floor,floor));
  if(result.rows.some(row=>!row.floor))selectedFloors.push(null);
  const floors=selectedFloors.map(floor=>({floor,label:DYEABLE_FLOOR_LABELS[floor] || 'Multiple / unassigned',buyers:[],totals:emptyDyeableSummaryCells()}));
  let excluded=0;
  for(const row of result.rows){
    const group=floors.find(group=>group.floor===row.floor);if(!group)continue;
    const key=constructionKey(row.buyer);let buyer=group.buyers.find(buyer=>buyer.key===key);
    if(!buyer){buyer={key,buyer:row.buyer || 'Buyer not specified',cells:emptyDyeableSummaryCells()};group.buyers.push(buyer);}
    const criterion=dyeableSummaryCriterion(row);if(criterion<0){excluded++;continue;}
    for(const cells of [buyer.cells,group.totals]){
      const cell=cells[criterion];cell.count++;
      if(row.totalKg===null)cell.missing++;else cell.quantity=productionSum([cell.quantity,row.totalKg]);
    }
  }
  for(const floor of floors)floor.buyers.sort((a,b)=>a.buyer.localeCompare(b.buyer,undefined,{numeric:true}));
  return {floors,excluded};
}
function dyeableSummaryQuantity(cell,excel=false) {
  return cell.missing?(cell.quantity?kgText(cell.quantity)+' + ':'')+'Weight missing ('+cell.missing+')':excel?cell.quantity:kgText(cell.quantity);
}
function dyeablePrintedAt(value) {
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:APP_SETTINGS.correctionTimeZone || 'Asia/Dhaka',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}).formatToParts(new Date(value));
  const p=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return p.day+'-'+p.month+'-'+p.year+' '+p.hour+':'+p.minute+':'+p.second+' '+p.dayPeriod.toUpperCase();
}
function renderDyeableSummary() {
  const result=dyeableSummaryResult;
  $('dyeableReportPanel').classList.add('hidden');$('dyeableSummaryPanel').classList.toggle('hidden',!result);$('dyeableReportEmpty').classList.toggle('hidden',!!result);
  if(!result)return;
  const summary=buildDyeableSummary(result),cells=values=>values.map(cell=>'<td class="summary-number">'+cell.count+'</td><td class="summary-number">'+esc(dyeableSummaryQuantity(cell))+'</td>').join('');
  const rows=summary.floors.map(floor=>{
    const buyers=floor.buyers.length?floor.buyers:[{buyer:'—',cells:emptyDyeableSummaryCells()}];
    return buyers.map((buyer,index)=>'<tr>'+(index===0?'<td class="summary-floor" rowspan="'+buyers.length+'">'+esc(floor.label)+'</td>':'')+'<td>'+esc(buyer.buyer)+'</td>'+cells(buyer.cells)+'</tr>').join('')+
      '<tr class="summary-floor-total"><th colspan="2">'+esc(dyeableFloorTotalLabel(floor))+'</th>'+cells(floor.totals)+'</tr>';
  }).join('');
  $('dyeableSummaryCriteria').textContent=dyeableFilterSummary(result.filters);
  $('dyeableSummaryTable').innerHTML='<table class="dyeable-summary-table"><colgroup><col style="width:13%"><col style="width:21%">'+Array(6).fill('<col style="width:11%">').join('')+'</colgroup><thead><tr><th colspan="2" class="summary-criteria">Criteria</th>'+DYEABLE_SUMMARY_CRITERIA.map((label,index)=>'<th colspan="2" class="summary-category-'+index+'">'+esc(label)+'</th>').join('')+'</tr><tr><th>Floor</th><th>Buyer</th>'+Array(3).fill('<th>No of Batch</th><th>Dyeable qty (kg)</th>').join('')+'</tr></thead><tbody>'+(rows || '<tr><td colspan="8">No floors selected.</td></tr>')+'</tbody></table>';
  const notes=result.warnings.slice();
  if(summary.excluded)notes.push(summary.excluded+' batch(es) have both knitting and labdip pending and fall outside the three displayed criteria.');
  $('dyeableSummaryNotes').textContent=notes.join(' ');$('dyeableSummaryNotes').classList.toggle('hidden',!notes.length);
  $('dyeableSummaryTimestamp').textContent='Printed Date & Time: '+dyeablePrintedAt(result.generatedAt);
  $('btnDownloadDyeableSummary').disabled=dyeableExportBusy;
}
function buildDyeableSummaryWorkbook(reader,result) {
  const summary=buildDyeableSummary(result),values=[['Dyeable Live Batch Status'],[dyeableFilterSummary(result.filters)],['Criteria','',...DYEABLE_SUMMARY_CRITERIA.flatMap(label=>[label,''])],['Floor','Buyer',...Array(3).fill(['No of Batch','Dyeable qty (kg)']).flat()]],merges=[{s:{r:0,c:0},e:{r:0,c:7}},{s:{r:1,c:0},e:{r:1,c:7}},{s:{r:2,c:0},e:{r:2,c:1}},...[2,4,6].map(c=>({s:{r:2,c},e:{r:2,c:c+1}}))];
  const rowCells=cells=>cells.flatMap(cell=>[cell.count,dyeableSummaryQuantity(cell,true)]);
  for(const floor of summary.floors){
    const start=values.length,buyers=floor.buyers.length?floor.buyers:[{buyer:'—',cells:emptyDyeableSummaryCells()}];
    buyers.forEach((buyer,index)=>values.push([index===0?floor.label:'',buyer.buyer,...rowCells(buyer.cells)]));
    if(buyers.length>1)merges.push({s:{r:start,c:0},e:{r:values.length-1,c:0}});
    merges.push({s:{r:values.length,c:0},e:{r:values.length,c:1}});values.push([dyeableFloorTotalLabel(floor),'',...rowCells(floor.totals)]);
  }
  values.push([]);const footer=values.length;values.push(['Printed Date & Time: '+dyeablePrintedAt(result.generatedAt),'','','','This is the PMC internal ERP System Generated Report']);
  merges.push({s:{r:footer,c:0},e:{r:footer,c:3}},{s:{r:footer,c:4},e:{r:footer,c:7}});
  if(summary.excluded){merges.push({s:{r:values.length,c:0},e:{r:values.length,c:7}});values.push([summary.excluded+' batch(es) with both knitting and labdip pending are outside the displayed criteria.']);}
  const sheet=reader.utils.aoa_to_sheet(values);sheet['!merges']=merges;sheet['!cols']=[{wch:20},{wch:28},...Array.from({length:3},()=>[{wch:17},{wch:21}]).flat()];sheet['!rows']=[{hpt:30},{hpt:30},{hpt:28},{hpt:26}];
  for(let row=4;row<footer;row++)for(const col of [3,5,7]){const cell=sheet[reader.utils.encode_cell({r:row,c:col})];if(cell?.t==='n')cell.z='#,##0.000';}
  const workbook=reader.utils.book_new();reader.utils.book_append_sheet(workbook,sheet,'Dyeable Batch Summary');workbook.Props={Title:'Dyeable Live Batch Status',Subject:dyeableFilterSummary(result.filters),Author:currentUsername()};return workbook;
}
function printDyeableSummary() {
  if(!dyeableSummaryResult)return;
  $('dyeableSummaryTimestamp').textContent='Printed Date & Time: '+dyeablePrintedAt(new Date().toISOString());
  document.body.classList.add('printing-dyeable-summary');
  try{window.print();}finally{document.body.classList.remove('printing-dyeable-summary');}
}

const GENERAL_INFO_ROWS=[
[['displayNumber','Booking No.'],['buyer','Buyer Name'],['team','Buyer Team'],['knitStart','Knit Start'],['knitEnd','Knit End'],['knittingPlan','Knitting Plan']],
[['date','Booking Date'],['eventDay','Event Day'],['style','Style'],['dyeStart','Dyeing Start'],['dyeEnd','Dyeing End'],['dyeingPlan','Dyeing Plan']],
[['pmc','PMC'],['merchant','Merchant'],['deliveryStart','Delivery Start'],['deliveryEnd','Delivery End'],['deliveryPlan','Delivery Plan']],
[['displayConfirmedBy','confirmed by'],['batchDate','Batch Plan Date'],['revisedBatch','Revised Batch Plan Date']]];
function generalInfoOverrides(booking,floor){return reportManualState(booking,floor).generalInfo || {};}
function generalInfoValues(booking,floor){const overrides=generalInfoOverrides(booking,floor);return {...booking,displayNumber:booking.displayNumber || booking.number,displayConfirmedBy:booking.displayConfirmedBy ?? savedReportPlan(currentReportBooking() || booking,floor).confirmedBy ?? '',batchDate:generalPlanTimestamp(booking,floor),revisedBatch:generalPlanTimestamp(booking,floor,true),...overrides,displayConfirmedBy:overrides.displayConfirmedBy || savedReportPlan(currentReportBooking() || booking,floor).confirmedBy || booking.confirmedBy || '',batchDate:overrides.batchDate || generalPlanTimestamp(booking,floor),revisedBatch:overrides.revisedBatch || generalPlanTimestamp(booking,floor,true)};}
function generalInfoTable(booking,floor){const values=generalInfoValues(booking,floor),editing=reportRowEditor?.kind==='general';return '<div class="table-wrap"><table class="info-table"><tbody>'+GENERAL_INFO_ROWS.map(fields=>'<tr>'+fields.map(([key,label],index)=>'<th>'+esc(label)+'</th><td'+(fields.length===3?' colspan="3"':fields.length===5 && index===0?' colspan="3"':'')+'>'+(editing?'<input class="report-row-input" data-general-field="'+key+'" aria-label="'+esc(label)+'" value="'+esc(reportRowEditor.values[key] ?? '')+'">':esc(values[key] || '—'))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function generalInfoActions(){return confirmedReportLocked()?'':reportRowEditor?.kind==='general'?'<span class="report-heading-actions report-add-row"><button class="btn success" data-general-action="save">Save</button><button class="btn secondary" data-general-action="cancel">Cancel</button></span>':'<button class="btn secondary report-add-row" data-general-action="edit">Edit</button>';}
function editGeneralInfo(){if(!reportDraft || !canEditReport() || mutationBusy)return false;if(reportRowEditor){toast('Save or cancel the current edit first.');return false;}reportRowEditor={kind:'general',values:copyReportData(generalInfoValues(getFloorBooking(currentReportBooking(),currentViewingFloor),currentViewingFloor))};refreshEditableReport();return true;}
async function saveGeneralInfo(){if(reportRowEditor?.kind!=='general' || !reportDraft || !canEditReport() || mutationBusy)return false;const before=copyReportData(reportDraft),editor=copyReportData(reportRowEditor),values={};$('reportContent').querySelectorAll('[data-general-field]').forEach(input=>values[input.dataset.generalField]=input.value.trim());reportDraft.manual.generalInfo=values;reportDraft.dirty=true;setMutationBusy(true);try{await retainSavedReportDraft();reportRowEditor=null;refreshEditableReport();toast('General Info saved. '+reportSaveHint());return true;}catch(error){reportDraft=before;reportRowEditor=editor;showSaveError(error);return false;}finally{setMutationBusy(false);}}
function generalDateDay(value){
  const text=String(value || '').trim();if(!text || text==='—')return '';let year,month,day,match;
  if(match=text.match(/^(\d{4})-(\d{2})-(\d{2})(?:\b|T)/)){[,year,month,day]=match;}
  else if(match=text.match(/^(\d{1,2})[\s\/-]([A-Za-z]{3,9}|\d{1,2})[\s,\/-]+(\d{2}|\d{4})(?:\b|\s)/)){day=match[1];month=/^\d+$/.test(match[2])?match[2]:['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].slice(0,3).toLowerCase())+1;year=Number(match[3]);if(year<100)year+=year>=70?1900:2000;}
  else return '';
  year=Number(year);month=Number(month);day=Number(day);const date=new Date(Date.UTC(year,month-1,day));if(date.getUTCFullYear()!==year || date.getUTCMonth()!==month-1 || date.getUTCDate()!==day)return '';return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
function confirmGeneralInfoError(booking,floor){
  const values=generalInfoValues(getFloorBooking(booking,floor),floor);
  if(String(values.dyeingPlan || '').trim().toLowerCase()!=='confirm')return 'Dyeing Plan must be “Confirm” before confirming the batch plan.';
  const start=generalDateDay(values.dyeStart);if(!start)return 'Enter a valid Dyeing Start date in General Info before confirming.';
  const batch=values.batchDate && values.batchDate!=='—'?values.batchDate:dyeablePrintedAt(new Date().toISOString()),revised=values.revisedBatch && values.revisedBatch!=='—'?values.revisedBatch:reportDraft?.reviewLatest?dyeablePrintedAt(new Date().toISOString()):'';
  for(const [label,value] of [['Batch Plan Date',batch],['Revised Batch Plan Date',revised]])if(value){const day=generalDateDay(value);if(!day)return 'Enter a valid '+label+' in General Info.';if(day>=start)return label+' must be earlier than Dyeing Start date. The same date is not allowed.';}
  return '';
}
$('reportContent').addEventListener('input',event=>{if(reportRowEditor?.kind==='general' && event.target.matches('[data-general-field]'))reportRowEditor.values[event.target.dataset.generalField]=event.target.value;});
$('reportContent').addEventListener('click',event=>{const button=event.target.closest('[data-general-action]');if(!button)return;if(button.dataset.generalAction==='edit')editGeneralInfo();else if(button.dataset.generalAction==='save')saveGeneralInfo();else{reportRowEditor=null;refreshEditableReport();}});

const INITIAL_UNIT_SETUP=[['Australian Open','EKL'],['BESTSELLER','EKL'],['BONDS','EKL'],['C&A','EKL'],['Calvin Klein Jeans','EFL'],['CARHARTT','EKL'],['CELIO','EKL'],['CHAMPION AUSTRALIA','EKL'],['CHAMPION EUROPE','EFL'],['CHAMPION USA','EFL'],['Country Road','EFL'],['Express','EFL'],['Gildan','EFL'],['G-STAR','EFL'],['H&M','EFL'],['J.Crew','EKL'],['Klattermusen','EKL'],['Lands End','EFL'],['M&S','EKL'],['MEDICINE','EFL'],['NEXT','EKL'],['OBEY','EKL'],['ORIGINAL MARINES','EKL'],['Puma','EFL'],['Ralph Lauren','EFL'],['RAW-ASOS','EFL'],['RIVER ISLAND','EKL'],['S.OLIVER','EFL'],['Sportsgirl','EFL'],['Stanley Stella','EFL'],['TARGET AUSTRALIA','EKL'],['Tommy Hilfiger','EFL'],['Tommy Jeans','EFL'],['VARNER','EKL'],['VISTULA','EFL'],['VOGUE SOURCING LIMITED','EFL']].map(([buyer,unit],index)=>({id:'unit_'+(index+1),buyer,unit,hidden:false}));
function getUnitSetup(){return appState.unitSetup || INITIAL_UNIT_SETUP;}
function unitBuyerKey(value){return String(value || '').trim().replace(/\s+/g,' ').toUpperCase();}
function unitForBuyer(buyer){return getUnitSetup().find(row=>!row.hidden && unitBuyerKey(row.buyer)===unitBuyerKey(buyer))?.unit || '';}
/* Project (plan section 15.5): Unit Setup lists one row per buyer — every buyer in the uploaded
   orders plus every buyer that already has a Unit Setup row. The default unit is chosen from the
   ACTIVE units of Dropdown Master Setup; a saved unit that is no longer active stays selectable.
   Changes are kept as a draft until Save Changes. Rows keep the demo shape {id,buyer,unit,hidden}. */
function unitSetupBuyerList(){
  const rows=new Map();
  for(const row of getUnitSetup()){const key=unitBuyerKey(row.buyer);if(key && !rows.has(key))rows.set(key,{key,buyer:String(row.buyer).trim()});}
  for(const name of unitSetupBuyerNames){const key=unitBuyerKey(name);if(key && !rows.has(key))rows.set(key,{key,buyer:String(name).trim()});}
  return [...rows.values()].sort((a,b)=>a.buyer.localeCompare(b.buyer));
}
function unitSetupValue(key){return unitSetupDraft && unitSetupDraft.has(key)?unitSetupDraft.get(key):unitForBuyer(key);}
function unitSetupOptions(current){
  const active=unitSetupUnitOptions.filter(unit=>unit.status==='ACTIVE').map(unit=>unit.name);
  const names=current && !active.some(name=>name.toLowerCase()===current.toLowerCase())?[current,...active]:active;
  return '<option value="">— No default —</option>'+names.map(name=>'<option value="'+esc(name)+'"'+(current && name.toLowerCase()===current.toLowerCase()?' selected':'')+'>'+esc(name)+(active.includes(name)?'':' (inactive)')+'</option>').join('');
}
function renderUnitSetup(){
  const query=unitBuyerKey($('unitSetupSearch').value),list=unitSetupBuyerList(),locked=mutationBusy || !storageReady || !BatchApi.has('menus.dataManagement.unitSetup');
  const rows=list.filter(row=>!query || unitBuyerKey(row.buyer+' '+unitSetupValue(row.key)).includes(query));
  $('unitSetupRows').innerHTML=rows.map(row=>'<tr><td>'+esc(row.buyer)+'</td><td><select class="setup-input" data-unit-buyer="'+esc(row.key)+'" aria-label="Default Unit for '+esc(row.buyer)+'"'+(locked?' disabled':'')+'>'+unitSetupOptions(unitSetupValue(row.key))+'</select></td></tr>').join('') || '<tr><td colspan="2">No matching buyer.</td></tr>';
  $('unitSetupStatus').textContent=list.length+' buyers · '+list.filter(row=>unitSetupValue(row.key)).length+' with a default unit'+(unitSetupDraft?.size?' · Unsaved changes':' · Saved');
}
function changeUnitSetupDefault(key,unit){
  if(!unitSetupDraft)unitSetupDraft=new Map();
  if(unit===unitForBuyer(key))unitSetupDraft.delete(key);else unitSetupDraft.set(key,unit);
  renderUnitSetup();
}
async function saveUnitSetup(){
  if(!canChangeData())return false;
  if(!unitSetupDraft?.size){toast('No Unit Setup changes to save.');return false;}
  const names=new Map(unitSetupBuyerList().map(row=>[row.key,row.buyer]));
  let rows=copyReportData(getUnitSetup());
  for(const [key,unit] of unitSetupDraft){
    const index=rows.findIndex(row=>unitBuyerKey(row.buyer)===key);
    if(!unit){rows=rows.filter(row=>unitBuyerKey(row.buyer)!==key);continue;}
    if(index<0){rows.push({id:'unit_'+Date.now()+'_'+Math.random().toString(36).slice(2),buyer:names.get(key) || key,unit,hidden:false});continue;}
    rows[index]={...rows[index],unit,hidden:false};
    rows=rows.filter((row,position)=>position===index || unitBuyerKey(row.buyer)!==key);
  }
  let saved=false;
  setMutationBusy(true);
  try{await commitChanges({unitSetup:rows});unitSetupDraft=null;saved=true;}catch(error){showSaveError(error);}finally{setMutationBusy(false);}
  if(!saved)return false;
  toast('Unit Setup saved. Batch Plan floors are being updated.');
  // Floors use these defaults when a colour has no Dyeing Plan unit (plan section 15.4), so load the data again.
  await initializeStorage();
  return true;
}
function generalPlanTimestamp(booking,floor,revised=false){const plan=savedReportPlan(currentReportBooking() || booking,floor);const value=revised?(plan.batchPlanRevisedAt || plan.lastReconfirmation?.savedAt):(plan.batchPlanCreatedAt || plan.confirmationHistory?.[0]?.confirmedAt);return value?dyeablePrintedAt(value):(revised?booking.revisedBatch:booking.batchDate) || '';}
$('navUnitSetup').addEventListener('click',()=>selectSetupPanel('unit'));
$('btnSaveUnitSetup').addEventListener('click',()=>saveUnitSetup());$('unitSetupSearch').addEventListener('input',renderUnitSetup);
$('unitSetupRows').addEventListener('change',event=>{const select=event.target.closest('[data-unit-buyer]');if(select)changeUnitSetupDefault(select.dataset.unitBuyer,select.value);});

let dailyConfirmResult=null;
const DAILY_CONFIRM_HEADERS=['Order number','Buyer','Unit','Batch plan status','Confirm batch Plan Date','Confirmed by'];
function dailyConfirmDay(value){const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:APP_SETTINGS.correctionTimeZone || 'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).map(p=>[p.type,p.value]));return parts.year+'-'+parts.month+'-'+parts.day;}
function dailyConfirmRevision(value){const n=Number(value)||0;if(!n)return 'Main';const last=n%100,suffix=last>=11 && last<=13?'th':n%10===1?'st':n%10===2?'nd':n%10===3?'rd':'th';return n+suffix+' Revise';}
function dailyConfirmationSource(){
  const records=[];
  for(const booking of getStoredMasterList()){
    const scopes=[...Object.entries(booking.floorPlans || {})];if(booking.confirmationHistory?.length || booking.status==='Confirm')scopes.push(['',booking]);
    for(const [floor,plan] of scopes){
      for(const event of plan.confirmationHistory || [])records.push({...copyReportData(event),floor,number:event.number || booking.number,legacy:false});
      if(!(plan.confirmationHistory || []).length && plan.status==='Confirm' && plan.lastSaveAt){const header=plan.confirmedSnapshot?.headerData || booking;records.push({number:booking.number,buyer:header.buyer || '',unit:header.unit || '',floor,revisionNo:plan.confirmedSnapshot?.revisionNo ?? 0,confirmedAt:plan.confirmedAt || plan.lastSaveAt,confirmedBy:plan.confirmedBy || '',fromStatus:plan.confirmedFromStatus || 'Unknown',legacy:!plan.confirmedAt || !plan.confirmedFromStatus});}
    }
  }return records;
}
function buildDailyConfirmReport(filters){
  const {from,to,route,floor,buyer}=filters;if(!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from>to)throw new Error('Select a valid From–To date range.');
  const rows=dailyConfirmationSource().filter(row=>{const day=dailyConfirmDay(row.confirmedAt);return day && day>=from && day<=to && (route==='Both' || row.fromStatus===route) && (floor==='All' || row.floor===floor) && (buyer==='All' || row.buyer===buyer);}).sort((a,b)=>new Date(b.confirmedAt)-new Date(a.confirmedAt) || String(a.number).localeCompare(String(b.number),undefined,{numeric:true}) || a.floor.localeCompare(b.floor));
  return {rows,filters:copyReportData(filters),generatedAt:new Date().toISOString()};
}
function closeDailyConfirmFilters(){const el=$('dailyConfirmFilters');el.classList.add('hidden');el.setAttribute('aria-hidden','true');}
function openDailyConfirmFilters(){
  if(!storageReady){toast('Storage is not ready.');return false;}
  const filters=dailyConfirmResult?.filters || {from:dailyConfirmDay(new Date()),to:dailyConfirmDay(new Date()),route:'Both',floor:'All',buyer:'All'};
  $('dailyConfirmFrom').value=filters.from;$('dailyConfirmTo').value=filters.to;
  $('dailyConfirmRoute').innerHTML=[['Both','Both'],['Pending','Pending to Confirm'],['Tentative','Tentative to Confirm']].map(([value,label])=>'<option value="'+value+'" '+(value===filters.route?'selected':'')+'>'+label+'</option>').join('');
  $('dailyConfirmFloor').innerHTML='<option value="All" '+(filters.floor==='All'?'selected':'')+'>All</option>'+BATCH_FLOORS.map(f=>'<option value="'+f.key+'" '+(filters.floor===f.key?'selected':'')+'>'+esc(f.label)+'</option>').join('');
  const buyers=Array.from(new Set([...getStoredMasterList().map(b=>b.buyer),...dailyConfirmationSource().map(row=>row.buyer)].filter(Boolean))).sort((a,b)=>a.localeCompare(b));
  $('dailyConfirmBuyer').innerHTML='<option value="All" '+(filters.buyer==='All'?'selected':'')+'>All</option>'+buyers.map(b=>'<option value="'+esc(b)+'" '+(filters.buyer===b?'selected':'')+'>'+esc(b)+'</option>').join('');
  $('dailyConfirmError').textContent='';$('dailyConfirmFilters').classList.remove('hidden');$('dailyConfirmFilters').setAttribute('aria-hidden','false');$('dailyConfirmFrom').focus();return true;
}
function previewDailyConfirmReport(){
  try{const result=buildDailyConfirmReport({from:$('dailyConfirmFrom').value,to:$('dailyConfirmTo').value,route:$('dailyConfirmRoute').value,floor:$('dailyConfirmFloor').value,buyer:$('dailyConfirmBuyer').value});dailyConfirmResult=result;closeDailyConfirmFilters();dyeableReportMode='daily';switchMainView('reports');return true;}catch(error){$('dailyConfirmError').textContent=error.message;return false;}
}
function dailyConfirmCells(row){return [row.number,row.buyer,row.unit,dailyConfirmRevision(row.revisionNo),dyeablePrintedAt(row.confirmedAt),row.confirmedBy];}
function renderDailyConfirmReport(){
  $('dyeableReportEmpty').classList.add('hidden');$('dyeableReportPanel').classList.add('hidden');$('dyeableSummaryPanel').classList.add('hidden');$('dailyConfirmPanel').classList.remove('hidden');
  const result=dailyConfirmResult;if(!result)return;const f=result.filters;
  $('dailyConfirmCriteria').textContent='From '+f.from+' to '+f.to+' · '+(f.route==='Both'?'Both':f.route+' to Confirm')+' · '+(f.floor==='All'?'All floors':floorLabel(f.floor))+' · '+(f.buyer==='All'?'All buyers':f.buyer);
  $('dailyConfirmCount').textContent=result.rows.length+' confirmed batch plan(s)';
  $('dailyConfirmTable').innerHTML=table(DAILY_CONFIRM_HEADERS,result.rows.length?result.rows.map(row=>'<tr>'+dailyConfirmCells(row).map(value=>'<td>'+esc(value || '—')+'</td>').join('')+'</tr>'):['<tr><td colspan="6">No confirmed batch plans match these filters.</td></tr>']);
  const legacy=result.rows.filter(row=>row.legacy).length;$('dailyConfirmNotes').textContent=legacy?legacy+' older record(s): original confirmation route was not recorded. These appear only under Both; the last saved date is used where the original confirmation date is unavailable.':'';
  $('dailyConfirmAsOf').textContent='Preview: '+dyeablePrintedAt(result.generatedAt);$('dailyConfirmExport').disabled=!result.rows.length;
}
async function downloadDailyConfirmReport(){
  if(!dailyConfirmResult?.rows.length)return;
  try{const reader=await ensureExcelReader(),values=[DAILY_CONFIRM_HEADERS,...dailyConfirmResult.rows.map(dailyConfirmCells),[],['Date range: '+dailyConfirmResult.filters.from+' to '+dailyConfirmResult.filters.to],...(dailyConfirmResult.rows.some(row=>row.legacy)?[['Older records: original confirmation route is unknown; these appear under Both. Last saved date is used if confirmation date is unavailable.']]:[])],sheet=reader.utils.aoa_to_sheet(values);sheet['!cols']=[{wch:20},{wch:28},{wch:24},{wch:24},{wch:32},{wch:26}];const workbook=reader.utils.book_new();reader.utils.book_append_sheet(workbook,sheet,'Daily Confirm Batch Plan');reader.writeFile(workbook,'Daily_Confirm_Batch_Plan_'+dailyConfirmResult.filters.from+'_to_'+dailyConfirmResult.filters.to+'.xlsx');}catch(error){toast(error.message);}
}
$('navDailyConfirm').addEventListener('click',openDailyConfirmFilters);$('btnDailyConfirmOpen').addEventListener('click',openDailyConfirmFilters);$('btnDailyConfirmFilters').addEventListener('click',openDailyConfirmFilters);
$('dailyConfirmForm').addEventListener('submit',event=>{event.preventDefault();previewDailyConfirmReport();});$('btnDailyConfirmCancel').addEventListener('click',closeDailyConfirmFilters);$('dailyConfirmExport').addEventListener('click',downloadDailyConfirmReport);
$('dailyConfirmPrint').addEventListener('click',()=>{document.body.classList.add('printing-daily-confirm');try{window.print();}finally{document.body.classList.remove('printing-daily-confirm');}});
$('dailyConfirmFilters').addEventListener('click',event=>{if(event.target===$('dailyConfirmFilters'))closeDailyConfirmFilters();});
$('dailyConfirmFilters').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeDailyConfirmFilters();}if(event.key==='Tab'){const controls=Array.from($('dailyConfirmFilters').querySelectorAll('input,select,button')),first=controls[0],last=controls[controls.length-1];if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}}});

$('navReport').addEventListener('click',()=>switchMainView('reports'));
$('navDyeableBatch').addEventListener('click',()=>openDyeableFilters('detail'));
$('navDyeableSummary').addEventListener('click',()=>openDyeableFilters('summary'));
for(const id of ['btnDyeableOpen','btnDyeableFilters'])$(id).addEventListener('click',()=>openDyeableFilters('detail'));
for(const id of ['btnDyeableSummaryOpen','btnDyeableSummaryFilters'])$(id).addEventListener('click',()=>openDyeableFilters('summary'));
$('btnDownloadDyeable').addEventListener('click',()=>downloadDyeableReport('detail'));
$('btnDownloadDyeableSummary').addEventListener('click',()=>downloadDyeableReport('summary'));
$('btnPrintDyeableSummary').addEventListener('click',printDyeableSummary);
$('dyeableFiltersForm').addEventListener('change',event=>{
  const input=event.target.closest('[data-dyeable-choice]');if(!input || !dyeableFilterContext)return;
  const key=input.dataset.dyeableKey,state=dyeableFilterContext.selections[key],value=input.dataset.dyeableChoice;
  if(value===DYEABLE_ALL){state.all=input.checked;state.values=new Set(input.checked?state.choices.map(([value])=>value):[]);}
  else{
    if(input.checked)state.values.add(value);else state.values.delete(value);
    state.all=state.choices.length>0 && state.choices.every(([value])=>state.values.has(value));
  }
  syncDyeableMulti(key);if(key==='floor')updateDyeableMachineChoices();
});
for(const id of Object.values(DYEABLE_FILTER_IDS))$(id).addEventListener('toggle',()=>{
  if($(id).open)for(const other of Object.values(DYEABLE_FILTER_IDS))if(other!==id)$(other).open=false;
});
$('dyeableFiltersForm').addEventListener('submit',event=>{event.preventDefault();previewDyeableReport();});
$('btnCancelDyeableFilters').addEventListener('click',()=>closeDyeableFilters());
$('dyeableFiltersDialog').addEventListener('click',event=>{if(event.target===$('dyeableFiltersDialog'))closeDyeableFilters();});
$('dyeableFiltersDialog').addEventListener('keydown',event=>{
  if(event.key==='Escape'){
    event.preventDefault();const open=Object.values(DYEABLE_FILTER_IDS).map($).find(root=>root.open);
    if(open){open.open=false;open.querySelector('summary').focus();}else closeDyeableFilters();
  }
  if(event.key==='Tab'){
    const controls=Array.from($('dyeableFiltersDialog').querySelectorAll('summary,input,button')).filter(element=>!element.disabled && (element.tagName==='SUMMARY' || !element.closest('details') || element.closest('details').open)),first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
  }
});


window.addEventListener('DOMContentLoaded', initializeStorage);
