"use client";
import { useRef, useState } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import light from '@/components/beacon/legacy-light.module.css';

type Confirmation = { title:string; description:string; action:()=>void; confirmLabel:string; cancelLabel:string };
export function useConfirmAction() {
  const [confirmation,setConfirmation]=useState<Confirmation|null>(null);
  const origin=useRef<HTMLElement|null>(null);
  function ask(title:string,description:string,action:()=>void,confirmLabel='放弃修改并继续',cancelLabel='继续编辑',restoreFocus?:HTMLElement|null) {
    const active=document.activeElement instanceof HTMLElement?document.activeElement:null;
    // A selected menu option is removed before the dialog closes. Restore its
    // stable trigger instead of leaving keyboard users on document.body.
    const trigger=document.querySelector<HTMLElement>('[role="combobox"][aria-expanded="true"],button[aria-haspopup="menu"][aria-expanded="true"]');
    origin.current=restoreFocus ?? trigger ?? active;
    setConfirmation({title,description,action,confirmLabel,cancelLabel});
  }
  const dialog=<AlertDialog open={!!confirmation} onOpenChange={open=>{if(!open)setConfirmation(null);}}>
    <AlertDialogContent className={light.portal} onCloseAutoFocus={event=>{event.preventDefault();if(origin.current?.isConnected)origin.current.focus();}}>
      <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle><AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
      <AlertDialogFooter><AlertDialogCancel>{confirmation?.cancelLabel}</AlertDialogCancel><AlertDialogAction onClick={()=>{const action=confirmation?.action;setConfirmation(null);action?.();}}>{confirmation?.confirmLabel}</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
  return {ask,dialog};
}
