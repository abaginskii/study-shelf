"use client";
import { useState } from 'react';
import { BookOpen, Check, LoaderCircle, Plus } from 'lucide-react';
import type { Material, Topic } from '@/lib/types';

export function ConceptList({material,topics,busy,importAll,edit}:{material:Material;topics:Topic[];busy:boolean;importAll:()=>void;edit:(title:string,body:string)=>void}){
 const [expanded,setExpanded]=useState<string|null>(null);
 const concepts=material.concepts||[];
 const normalize=(title:string)=>title.trim().toLocaleLowerCase('ru').replace(/\s+/g,' ');
 const saved=new Set(topics.filter(topic=>topic.materialId===material.id).map(topic=>normalize(topic.title)));
 const terms=concepts.length?concepts.map(concept=>concept.title):material.terms;
 const remaining=terms.filter(title=>!saved.has(normalize(title))).length;
 return <section className="panel concept-panel"><div className="panel-label"><BookOpen size={18}/>Понятия из лекции</div>{terms.length?<>
  <p className="muted small">Объяснения составлены по материалу. Проверьте их, затем добавьте в базу знаний.</p>
  <div className="concept-items">{terms.map(title=>{const concept=concepts.find(item=>item.title===title);const added=saved.has(normalize(title));return <div className="concept-item" key={title}><button className="concept-title" aria-expanded={expanded===title} onClick={()=>setExpanded(value=>value===title?null:title)}><span>{title}</span>{added?<Check size={16} aria-label="В базе знаний"/>:<Plus size={16}/>}</button>{expanded===title?<div className="concept-body">{concept?<><p>{concept.description}</p>{concept.sourceQuote?<blockquote><span>Из лекции</span>{concept.sourceQuote}</blockquote>:null}</>:<p>Описание будет подготовлено из лекции при добавлении всех понятий.</p>}<button className="text-button" onClick={()=>edit(title,concept?.description||'')}>Проверить и сохранить отдельно</button></div>:null}</div>})}</div>
  <button className="button primary full" disabled={busy||remaining===0} onClick={importAll}>{busy?<LoaderCircle className="spin" size={17}/>:remaining===0?<Check size={17}/>:<Plus size={17}/>} {remaining===0?'Все понятия в базе знаний':`Добавить все · ${remaining}`}</button>
  <p className="muted small concept-help">{concepts.length?'С описаниями и ссылкой на лекцию. Повторное добавление не создаёт копии.':'Для описаний будет использован один запуск ИИ.'}</p>
 </>:<p className="muted">Понятия с объяснениями появятся вместе с конспектом.</p>}</section>;
}
