import type {Kind} from './types';import {AppError} from './storage';
export const MAX_UPLOAD=60*1024*1024;
export function inspectFile(data:Buffer,name:string):{kind:Kind;mime:string}{
 const ext=name.toLowerCase().split('.').pop();
 if(ext==='pdf'&&data.subarray(0,5).toString()==='%PDF-')return {kind:'pdf',mime:'application/pdf'};
 if(['jpg','jpeg'].includes(ext||'')&&data[0]===255&&data[1]===216&&data[2]===255)return {kind:'image',mime:'image/jpeg'};
 if(ext==='png'&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {kind:'image',mime:'image/png'};
 if(ext==='webp'&&data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP')return {kind:'image',mime:'image/webp'};
 if(['txt','md'].includes(ext||'')){if(data.includes(0))throw new AppError('Текстовый файл содержит бинарные данные.');return {kind:'text',mime:'text/plain'}};
 if(ext==='wav'&&data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WAVE')return {kind:'audio',mime:'audio/wav'};
 if(ext==='mp3'&&(data.subarray(0,3).toString()==='ID3'||(data[0]===255&&(data[1]&224)===224)))return {kind:'audio',mime:'audio/mpeg'};
 if(['m4a','mp4','mov'].includes(ext||'')&&data.subarray(4,8).toString()==='ftyp')return {kind:ext==='m4a'?'audio':'video',mime:ext==='m4a'?'audio/mp4':'video/mp4'};
 if(ext==='webm'&&data.subarray(0,4).equals(Buffer.from([26,69,223,163])))return {kind:'audio',mime:'audio/webm'};
 if(ext==='ogg'&&data.subarray(0,4).toString()==='OggS')return {kind:'audio',mime:'audio/ogg'};
 throw new AppError('Поддерживаются PDF, JPG, PNG, WebP, TXT, Markdown, MP3, WAV, M4A, WebM, OGG и MP4. Формат файла должен совпадать с расширением.');
}
export async function extractPDF(data:Buffer){const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(data),useSystemFonts:true});try{const pdf=await task.promise;if(pdf.numPages>100)throw new AppError('PDF содержит больше 100 страниц. Разделите его на лекции.');let text='';for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();text+=`\n\n[Страница ${i}]\n`+content.items.map(item=>'str' in item?item.str:'').join(' ');if(text.length>120000)throw new AppError('Текст PDF слишком большой. Разделите файл.');page.cleanup()}return text.trim()}finally{await task.destroy()}}
