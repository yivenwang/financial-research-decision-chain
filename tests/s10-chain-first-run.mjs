import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { parseFinancialReportV06Strict } from '../lib/parser-v06-strict.ts';
import { runC04Chain } from '../lib/chain-v01.ts';

const TARGET = { sourceId:'S-10', period:'2021H1', securityCode:'300866' };
const normalize=(s)=>String(s??'').replace(/<[^>]+>/g,'').replace(/\s+/g,'');

async function queryAnnouncements(params){
  const endpoint='https://www.cninfo.com.cn/new/hisAnnouncement/query';
  const form=new URLSearchParams({
    pageNum:String(params.pageNum??1), pageSize:String(params.pageSize??100),
    column:'szse', tabName:'fulltext', plate:'sz', stock:params.stock??'',
    searchkey:params.searchkey??'', secid:'', category:params.category??'', trade:'',
    seDate:params.seDate??'', sortName:'time', sortType:'desc', isHLtitle:'true',
  });
  const response=await fetch(endpoint,{method:'POST',headers:{
    'content-type':'application/x-www-form-urlencoded; charset=UTF-8',
    'user-agent':'Mozilla/5.0 ChainBlindTest/1.0',
    referer:'https://www.cninfo.com.cn/', origin:'https://www.cninfo.com.cn',
    'x-requested-with':'XMLHttpRequest',
  },body:form});
  assert.equal(response.ok,true,`CNINFO discovery failed: ${response.status}`);
  const payload=await response.json();
  return Array.isArray(payload.announcements)?payload.announcements:[];
}

async function resolveOrgIdFromKnownMetadata(){
  // S-09 / 2022H1 is already regression data. This query reads metadata only.
  const rows=await queryAnnouncements({
    searchkey:'安克创新2022年半年度报告',
    seDate:'2022-01-01~2022-12-31',
    pageSize:100,
  });
  const known=rows.find((row)=>{
    const title=normalize(row.announcementTitle);
    return String(row.secCode??'')===TARGET.securityCode && title.includes('2022年半年度报告') && !title.includes('摘要');
  });
  assert.ok(known,'Could not resolve orgId from already-known 2022H1 metadata');
  const orgId=known.orgId??known.orgID??known.orgid;
  assert.equal(typeof orgId,'string','Known metadata contains no orgId');
  assert.ok(orgId.length>0,'Known metadata orgId is empty');
  return orgId;
}

async function discoverOfficialPdf(){
  const orgId=await resolveOrgIdFromKnownMetadata();
  const stockKey=`${TARGET.securityCode},${orgId}`;
  const queryPlans=[
    { stock:stockKey, searchkey:'', category:'category_bndbg_szsh', seDate:'2021-01-01~2021-12-31' },
    { stock:stockKey, searchkey:'2021年半年度报告', category:'', seDate:'2021-01-01~2021-12-31' },
    { stock:stockKey, searchkey:'半年度报告', category:'', seDate:'2021-01-01~2021-12-31' },
  ];

  for(const plan of queryPlans){
    for(let pageNum=1;pageNum<=5;pageNum+=1){
      const rows=await queryAnnouncements({...plan,pageNum,pageSize:100});
      const candidate=rows.find((row)=>{
        const title=normalize(row.announcementTitle);
        return String(row.secCode??'')===TARGET.securityCode &&
          title.includes('2021年半年度报告') && !title.includes('摘要');
      });
      if(candidate){
        assert.equal(typeof candidate.adjunctUrl,'string');
        return {
          title:normalize(candidate.announcementTitle),
          announcementId:candidate.announcementId??null,
          announcementTime:candidate.announcementTime??null,
          url:`https://static.cninfo.com.cn/${String(candidate.adjunctUrl).replace(/^\//,'')}`,
        };
      }
      if(rows.length===0) break;
    }
  }
  assert.fail('No full 2021H1 report discovered using resolved orgId and semiannual-report metadata filters');
}

async function extractPdf(url){
  const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 ChainBlindTest/1.0'}});
  assert.equal(response.ok,true,`PDF download failed: ${response.status}`);
  const buffer=Buffer.from(await response.arrayBuffer());
  const pdfSha256=createHash('sha256').update(buffer).digest('hex');
  const doc=await pdfjs.getDocument({data:new Uint8Array(buffer),disableWorker:true}).promise;
  const items=[];
  for(let pageNumber=1;pageNumber<=doc.numPages;pageNumber+=1){
    const page=await doc.getPage(pageNumber); const content=await page.getTextContent();
    for(const raw of content.items){
      if(typeof raw.str!=='string'||!Array.isArray(raw.transform)) continue;
      const x=Number(raw.transform[4]); const y=Number(raw.transform[5]);
      if(!Number.isFinite(x)||!Number.isFinite(y)) continue;
      items.push({str:raw.str,x,y,page:pageNumber,width:typeof raw.width==='number'?raw.width:undefined});
    }
  }
  return {items,pageCount:doc.numPages,pdfBytes:buffer.length,pdfSha256};
}

const discovered=await discoverOfficialPdf();
const extracted=await extractPdf(discovered.url);
const source={sourceId:TARGET.sourceId,period:TARGET.period,url:discovered.url};
const parser=parseFinancialReportV06Strict(extracted.items,source);
const chain=runC04Chain(parser,{
  runId:'CHAIN-BLIND-02-S10-FIRST', priorAdjustedYoy:[], accountingAdjustmentRecurring:null,
  gates:{eg01:'pending',eg02:'pending'},
  valuation:{dilutedSharesMn:null,peMultiples:{bear:18,base:24,bull:30}},
});
const artifact={
  protocol:'Chain Blind Test 02 / S-10 first run before human truth comparison',
  frozenBaseline:{parser:'V0.6-main',chain:'V0.1-main'},
  discoveredSource:{sourceId:TARGET.sourceId,period:TARGET.period,title:discovered.title,announcementId:discovered.announcementId,announcementTime:discovered.announcementTime,url:discovered.url},
  pdfSha256:extracted.pdfSha256,pdfBytes:extracted.pdfBytes,pageCount:extracted.pageCount,textItemCount:extracted.items.length,
  parserFirstRun:parser,chainFirstRun:chain,
  discipline:{expectedFinancialValuesEmbedded:false,parserModifiedForS10:false,chainModifiedForS10:false,humanTruthComparisonPerformed:false},
};
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/S10_CHAIN_FIRST_RUN_FROZEN.json',JSON.stringify(artifact,null,2));
console.log(`S-10 first-run artifact preserved. PDF sha256=${artifact.pdfSha256}`);

// Governance-only checks after machine output preservation.
assert.equal(chain.decision.action,'继续研究');
assert.equal(chain.decision.formalRecommendation,null);
assert.ok(chain.decision.blockedGates.includes('EG-01'));
assert.ok(chain.decision.blockedGates.includes('EG-02'));
assert.deepEqual(chain.graphDiff.unchangedNodeIds,['C-01','C-02','C-03','C-05','C-06']);
assert.equal(chain.valuation.publishable,false);
