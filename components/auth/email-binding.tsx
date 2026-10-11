'use client';
import {useEffect,useState,type FormEvent} from 'react';
export function EmailBinding({email,refresh}:{email?:string;refresh:()=>void}){
 const [address,setAddress]=useState(email||'');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [saved,setSaved]=useState(false);
 useEffect(()=>{setAddress(email||'')},[email]);
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');setSaved(false);try{const response=await fetch('/api/account/email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',email:address})});const data=await response.json();if(!response.ok)throw new Error(data.error);setAddress(data.user.email);setSaved(true);refresh()}catch(reason){setError(reason instanceof Error?reason.message:'Попробуйте позже.')}finally{setBusy(false)}}
 return <section className="account-card email-binding"><h2>Контактная почта</h2><p>Сохраните email в аккаунте. Подтверждение письмом не требуется. Для входа используйте логин и пароль.</p><form onSubmit={submit}><label>Email<input name="email" type="email" required autoComplete="email" maxLength={254} value={address} onChange={event=>{setAddress(event.target.value);setSaved(false)}}/></label><button className="button primary" disabled={busy}>{busy?'Сохраняем…':'Сохранить почту'}</button></form>{saved&&<p role="status">Почта сохранена.</p>}{error&&<p className="notice error-notice" role="alert">{error}</p>}</section>;
}
