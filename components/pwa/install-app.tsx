'use client';

import {useState} from 'react';
import {Check,Download,Share2,Smartphone} from 'lucide-react';
import {usePWA} from './provider';
import styles from './install-app.module.css';

export function InstallApp(){
 const {installed,ios,canInstall,install}=usePWA();const [expanded,setExpanded]=useState(false);const [error,setError]=useState('');
 return <section className={styles.card} aria-label="Установка Полки">
  <div className={styles.header}><span className={styles.icon}>{installed?<Check size={22}/>:<Smartphone size={22}/>}</span><div><h3>{installed?'polka установлена':'polka на вашем устройстве'}</h3><p>{installed?'Библиотека открывается как отдельное приложение.':'Быстрый доступ к учёбе с домашнего экрана.'}</p></div></div>
  {!installed&&<>
   {canInstall?<button className="button secondary" type="button" onClick={()=>{setError('');void install().catch(()=>setError('Откройте меню браузера и выберите установку приложения.'))}}><Download size={17}/>Установить Полку</button>:<button className="button secondary" type="button" aria-expanded={expanded} aria-controls="pwa-install-instructions" onClick={()=>setExpanded(value=>!value)}>{ios?<Share2 size={17}/>:<Download size={17}/>}{ios?'Как добавить на iPhone':'Как установить приложение'}</button>}
   {expanded&&<div id="pwa-install-instructions" className={styles.instructions}>{ios?<ol><li>Откройте Полку в Safari.</li><li>В меню браузера нажмите «Поделиться» <Share2 size={14} aria-hidden="true"/>.</li><li>Выберите «На экран „Домой“», затем «Добавить». Если показан переключатель «Открывать как веб-приложение», включите его.</li></ol>:<p>Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран». Если пункта нет, откройте сайт в Chrome, Edge или Safari.</p>}<p>Материалы и ответы ИИ доступны при подключении к интернету. Для входа используется ваш аккаунт Полки.</p></div>}
  </>}
  {error&&<p role="status" className={styles.instructions}>{error}</p>}
 </section>;
}
