'use client';

import {createContext,useCallback,useContext,useEffect,useState,type ReactNode} from 'react';

type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:'accepted'|'dismissed'}>};
type PWAState={installed:boolean;ios:boolean;canInstall:boolean;install:()=>Promise<void>};
const Context=createContext<PWAState>({installed:false,ios:false,canInstall:false,install:async()=>{}});

export function PWAProvider({children}:{children:ReactNode}){
 const [prompt,setPrompt]=useState<InstallPrompt|null>(null);
 const [installed,setInstalled]=useState(false);const [ios,setIOS]=useState(false);
 useEffect(()=>{
  const mode=window.matchMedia('(display-mode: standalone)');
  const check=()=>setInstalled(mode.matches||!!(navigator as Navigator&{standalone?:boolean}).standalone);
  check();setIOS(/iPad|iPhone|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1));
  const available=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt)};
  const added=()=>{setInstalled(true);setPrompt(null)};
  window.addEventListener('beforeinstallprompt',available);window.addEventListener('appinstalled',added);mode.addEventListener('change',check);
  if(window.isSecureContext&&'serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).catch(()=>{});
  return()=>{window.removeEventListener('beforeinstallprompt',available);window.removeEventListener('appinstalled',added);mode.removeEventListener('change',check)};
 },[]);
 const install=useCallback(async()=>{if(!prompt)return;setPrompt(null);await prompt.prompt();await prompt.userChoice},[prompt]);
 return <Context.Provider value={{installed,ios,canInstall:!!prompt,install}}>{children}</Context.Provider>;
}
export const usePWA=()=>useContext(Context);
