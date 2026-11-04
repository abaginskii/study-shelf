'use client';
import {useState} from 'react';

// «Войти с orvo ID»: the button from the orvo brand canvas. The dot orbits the ring while the redirect starts.
export function OrvoMark({size=30}:{size?:number}){
 return <span className="orvo-mark" style={{width:size,height:size}} aria-hidden="true"><svg viewBox="0 0 100 100"><path d="M81.6 45A32 32 0 1 1 55 18.4"/><circle cx="72.6" cy="27.4" r="9"/></svg></span>;
}

export function OrvoButton({label='Войти с',compact=false}:{label?:string;compact?:boolean}){
 const [busy,setBusy]=useState(false);
 return <a className={`orvo-button${compact?' compact':''}${busy?' busy':''}`} href="/api/auth/orvo/start" onClick={()=>setBusy(true)} aria-busy={busy}>
  <span>{label}</span><OrvoMark size={compact?26:32}/><span>orvo ID</span>
 </a>;
}
