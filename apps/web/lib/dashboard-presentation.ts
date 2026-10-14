import type { ResearchVersion, StoredEvidence } from './research-versions.ts';

export function metricTone(item?: StoredEvidence): 'up' | 'down' | 'neutral' {
  return item?.changePct == null || !Number.isFinite(item.changePct) || item.changePct === 0 ? 'neutral' : item.changePct > 0 ? 'up' : 'down';
}
export function dashboardPresentation(version: ResearchVersion) {
  const evidence = version.evidence;
  const missing = ['attributable_np','adjusted_np','non_recurring_total'].filter(key =>
    !evidence.some(item => item.metricKey === key && item.reviewStatus === 'accepted' && Number.isFinite(item.valueMn) &&
      (key === 'non_recurring_total' || (item.changePct != null && Number.isFinite(item.changePct)))));
  const blocked = version.chain?.status === 'blocked' || version.chain?.formula?.consistent === false || version.parser?.canPromoteToEvidence === false || version.formula?.consistent === false;
  const professional = [...new Set([...(version.blockedGates ?? []), ...(version.chain?.decision.blockedGates ?? []), ...(version.chain?.valuation.blockedGates ?? []), ...(version.chain?.assumption.status === "pending-review" ? ["EG-01"] : []), ...(!version.chain ? ["EG-01","EG-02"] : [])])].filter(gate => /^EG-/.test(gate));
  const tasks = evidence.filter(item => item.reviewStatus !== 'accepted').map(item => ({
    id:item.id, label:`证据待核验：${item.label}`, status:item.reviewStatus === 'rejected' ? '已拒绝，需核对' : '待核验',
    reason:`${item.location} · 尚未接受该事实`, owner:'事实核验研究者', href:'/evidence', action:'查看证据并重新提交材料',
  }));
  if (missing.length) tasks.push({id:'missing-evidence',label:'证据不足',status:'阻塞',reason:`缺少已核验指标：${missing.join('、')}`,owner:'事实核验研究者',href:'/changes',action:'提交并逐条核验材料'});
  const technical = [...new Set([...(version.blockedGates ?? []),...(version.chain?.decision.blockedGates ?? [])])].filter(gate => !/^EG-/.test(gate));
  if(blocked || technical.length) tasks.push({id:'blocked-calculation',label:'计算或证据阻断',status:'阻塞',reason:technical.join('、') || '当前证据或 F-02 未通过',owner:'事实核验研究者',href:'/changes',action:'核对并重新提交材料'});
  for (const gate of professional) tasks.push({id:gate,label:`专业判断待处理：${gate}`,status:'待专业复核',reason:gate==='EG-01'?'会计调整性质与 A-03 尚无专业签署':'估值口径尚无专业签署',owner:gate==='EG-01'?'会计专业复核人':'估值专业复核人',href:`/help#professional-review`,action:'准备专业复核材料'});
  const needsReview = professional.length > 0 || !version.chain || version.chain.claim.humanSignoffRequired;
  return {
    missing, blocked, professional, tasks,
    calculationReady: !blocked && !missing.length && version.formula?.consistent === true && version.chain?.formula?.consistent === true,
    title: blocked ? '当前研究更新已阻断' : missing.length ? '当前证据不足，等待核验' : needsReview ? `${version.claim.id} · 系统信号：${version.claim.systemSignal ?? '不更新'}，判断待审核` : `${version.claim.id} · 当前记录：${version.claim.after}`,
    description: blocked ? '请处理当前阻断原因；原研究判断保留，不能由本次更新形成确定性结论。' : missing.length ? '必要证据尚不完整，未形成可核验的研究影响。' : `当前规则信号为${version.claim.systemSignal ?? '不更新'}；人工记录为${version.claim.after}。${professional.length ? professional.join(' / ') + ' 待专业复核。' : '正式动作仍需人工签署。'}`,
    next: tasks[0] ?? {href:'/questions',action:'继续研究并核对草稿'},
  };
}
