"use client";
import { useEffect, useEffectEvent, useRef } from 'react';
import { useConfirmAction } from './use-confirm-action';

export function guardResearchSwitch(action:()=>void) {
  const event=new CustomEvent('beacon-research-switch',{cancelable:true,detail:action});
  if(window.dispatchEvent(event))action();
}

export function useUnsavedGuard(dirty:boolean, discard:()=>void) {
  const confirmation=useConfirmAction();
  const bypass=useRef(false);
  function protect(action:()=>void,force=false) {
    if(!dirty&&!force){action();return;}
    confirmation.ask('放弃未保存修改？','未提交的正文、审核人或意见不会保存；已保存的版本和审核历史保留。可以继续编辑，或确认放弃后继续。',()=>{discard();bypass.current=true;setTimeout(action,0);});
  }
  const protectNavigation=useEffectEvent((action:()=>void)=>protect(action));
  useEffect(()=>{
    if(!dirty){bypass.current=false;return;}
    const beforeUnload=(event:BeforeUnloadEvent)=>{if(!bypass.current){event.preventDefault();event.returnValue='';}};
    const click=(event:MouseEvent)=>{
      if(bypass.current||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const element=event.target instanceof Element?event.target.closest<HTMLElement>('a[href], [data-research-switch]'):null;
      if(!element)return;
      const link=element instanceof HTMLAnchorElement?element:null;
      if(link&&(link.target==='_blank'||link.hasAttribute('download')||link.getAttribute('href')?.startsWith('#')))return;
      event.preventDefault();event.stopImmediatePropagation();
      protectNavigation(()=>{bypass.current=true;if(link)window.location.assign(link.href);else element.click();});
    };
    const switchResearch=(event:Event)=>{if(bypass.current)return;event.preventDefault();event.stopImmediatePropagation();protectNavigation(()=>guardResearchSwitch((event as CustomEvent<()=>void>).detail));};
    window.addEventListener('beacon-research-switch',switchResearch);
    window.addEventListener('beforeunload',beforeUnload);document.addEventListener('click',click,true);
    return()=>{window.removeEventListener('beacon-research-switch',switchResearch);window.removeEventListener('beforeunload',beforeUnload);document.removeEventListener('click',click,true);};
  },[dirty]);
  return {protect,dialog:confirmation.dialog};
}
