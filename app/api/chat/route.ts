import {requireStudyAccess} from '@/lib/billing';
import {after} from 'next/server';
import {requireUser,checkOrigin,consumeLimit} from '@/lib/auth';
import {AppError,getLibrary,getMaterial,createChat,beginChatTurn,finishChatTurn,safeId} from '@/lib/storage';
import {body,json,route} from '@/lib/http';
import {aiAvailable,streamChatAnswer,verifiedChatAnswer,aiError} from '@/lib/ai';
import type {Material} from '@/lib/types';
export const maxDuration=120;
export const dynamic='force-dynamic';

export async function POST(request:Request){return route(async()=>{
 checkOrigin(request);const user=await requireUser();requireStudyAccess(await getLibrary(user.id));const input=await body(request);
 if(!aiAvailable())throw new AppError('ИИ ещё не подключён. История и материалы сохранены.',503);
 const action=input.action||'send';if(!['send','retry','regenerate'].includes(action))throw new AppError('Некорректное действие.');
 if(typeof input.requestId!=='string')throw new AppError('Укажите идентификатор запроса.');const requestId=safeId(input.requestId);
 const message=typeof input.message==='string'?input.message.trim():'';if(action==='send'&&(!message||message.length>4000))throw new AppError('Сообщение должно содержать от 1 до 4000 символов.');
 if(input.materialIds!==undefined&&(!Array.isArray(input.materialIds)||input.materialIds.length>8||input.materialIds.some((id:unknown)=>typeof id!=='string')))throw new AppError('Выберите до 8 материалов.');
 const materialIds=input.materialIds===undefined?undefined:[...new Set<string>(input.materialIds)];
 if(materialIds)await Promise.all(materialIds.map(id=>getMaterial(user.id,id)));
 await consumeLimit('chat:'+user.id,30,3600000);
 let chatId:string;if(input.chatId!==undefined){if(typeof input.chatId!=='string')throw new AppError('Некорректный чат.');chatId=safeId(input.chatId)}else{if(action!=='send')throw new AppError('Выберите существующий чат.');chatId=(await createChat(user.id,message,materialIds||[],requestId)).id}
 const turn=await beginChatTurn(user.id,chatId,{requestId,message,materialIds,action});
 const encoder=new TextEncoder();const abort=new AbortController();let disconnected=false;
 const onRequestAbort=()=>abort.abort();if(request.signal.aborted)abort.abort();else request.signal.addEventListener('abort',onRequestAbort,{once:true});
 const stream=new ReadableStream<Uint8Array>({
  start(controller){
   const emit=(event:unknown)=>{if(disconnected)return;try{controller.enqueue(encoder.encode('data: '+JSON.stringify(event)+'\n\n'))}catch{disconnected=true;abort.abort()}};
   const pending=turn.chat.pending;
   emit({type:'start',chatId,userMessageId:pending?.userMessageId,assistantMessageId:turn.replay?.id||pending?.assistantMessageId});
   const task=(async()=>{
    let content='';let sources:Parameters<typeof verifiedChatAnswer>[1]=[];
    try{
     if(turn.replay){emit({type:'delta',text:turn.replay.content});emit({type:'done',chat:turn.chat});return}
     const lib=await getLibrary(user.id);const ids=turn.chat.materialIds.filter(id=>lib.materials.some(m=>m.id===id));
     if(turn.chat.materialIds.length&&!ids.length)throw new AppError('Выбранные источники удалены. Выберите другие материалы или начните общий учебный разговор.');
     const materials:Material[]=await Promise.all(ids.map(async id=>(await getMaterial(user.id,id)).value));
     const answer=await streamChatAnswer(turn.chat,materials,user.id,abort.signal);sources=answer.sources;
     for await(const part of answer.result.fullStream){
      if(part.type==='text-delta'){content+=part.text;emit({type:'delta',text:part.text})}
      else if(part.type==='error')throw part.error;
      else if(part.type==='abort')throw new AppError('Ответ остановлен. Его можно получить заново.');
      else if(part.type==='finish'&&part.finishReason==='length')throw new AppError('Ответ слишком длинный. Уточните вопрос или попросите ответить короче.');
     }
     if(abort.signal.aborted)throw new AppError('Ответ остановлен. Его можно получить заново.');
     if(!content.trim())throw new AppError('ИИ не вернул ответ. Попробуйте ещё раз.');
     const verified=verifiedChatAnswer(content,sources);const usage=await answer.result.totalUsage;const chat=await finishChatTurn(user.id,chatId,requestId,verified.answer,verified.sources,undefined,{modelName:answer.modelName,tokenUsage:{input:usage.inputTokens??null,output:usage.outputTokens??null,total:usage.totalTokens??null},estimatedCost:null});
     emit({type:'done',chat});
    }catch(error){
     const failure=aiError(error);const verified=verifiedChatAnswer(content,sources);
     if(!turn.replay)await finishChatTurn(user.id,chatId,requestId,verified.answer,verified.sources,failure.message).catch(()=>console.error('Chat interruption persistence deferred'));
     emit({type:'error',error:failure.message,retryable:failure.status!==429});
    }finally{request.signal.removeEventListener('abort',onRequestAbort);if(!disconnected)try{controller.close()}catch{}}
   })();
   // Keep the persistence task alive even if the client stops reading its stream.
   after(task);
  },
  cancel(){disconnected=true;abort.abort()}
 });
 return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'private, no-store, no-transform','X-Accel-Buffering':'no'}});
})}
