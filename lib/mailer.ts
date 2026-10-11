import nodemailer from 'nodemailer';
import {AppError} from './storage';
export const emailProvider=()=>process.env.MAIL_PROVIDER|| (process.env.BREVO_API_KEY?'brevo':'smtp');
export const emailReady=()=>emailProvider()==='brevo'?!!process.env.BREVO_API_KEY:emailProvider()==='smtp'&&!!process.env.SMTP_PASSWORD;
const senderAddress=()=>process.env.MAIL_FROM||process.env.SMTP_USER||'polka.sluzhbazaboty@yandex.ru';
class MailApiError extends Error{constructor(public code:string){super('Mail API unavailable')}}
async function mailApi(endpoint:'smtp/email'|'senders',body:Record<string,unknown>){
 let response:Response;
 try{response=await fetch(`https://api.brevo.com/v3/${endpoint}`,{method:endpoint==='senders'?'GET':'POST',headers:{'Content-Type':'application/json','api-key':process.env.BREVO_API_KEY||''},body:endpoint==='senders'?undefined:JSON.stringify(body),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(12000)})}catch{throw new MailApiError('MAIL_NETWORK')}
 if(!response.ok)throw new MailApiError(response.status===401||response.status===403?'MAIL_AUTH':response.status===429?'MAIL_QUOTA':'MAIL_API');
 const result=await response.json().catch(()=>null);
 if(!result||typeof result!=='object'||result.code)throw new MailApiError('MAIL_API');
 return result;
}
// Whitelisted transport categories only; raw SMTP responses can contain account data.
export function emailConnectionHint(reason:unknown){
 const error=reason&&typeof reason==='object'?reason as {code?:unknown;responseCode?:unknown}:{};
 const status=typeof error.responseCode==='number'&&error.responseCode>=100&&error.responseCode<=599?` (SMTP ${error.responseCode})`:'';
 if(error.code==='MAIL_NETWORK')return 'Brevo не ответил через HTTPS. Проверьте доступность сервиса.';
 if(error.code==='MAIL_AUTH')return 'Brevo отклонил ключ API или его права доступа.';
 if(error.code==='MAIL_QUOTA')return 'Достигнут лимит доставки писем Brevo.';
 if(error.code==='MAIL_SENDER')return 'Подтвердите адрес отправителя в Brevo → Settings → Senders, Domains, IPs → Senders.';
 if(error.code==='MAIL_API')return 'Brevo отклонил запрос. Проверьте ключ, права API, отправителя и бесплатную квоту в кабинете сервиса.';
 if(error.code==='EAUTH')return `Яндекс отклонил вход${status}. Проверьте пароль приложения «Почта» для polka.sluzhbazaboty@yandex.ru и разрешение почтовых клиентов.`;
 if(error.code==='ETIMEDOUT')return 'SMTP не ответил вовремя. Проверьте доступность почтового сервера.';
 if(error.code==='EDNS')return 'Не удалось определить адрес SMTP-сервера.';
 if(error.code==='ESOCKET'||error.code==='ECONNECTION')return 'SMTP-соединение прервано. Проверьте сеть и TLS-подключение.';
 if(error.code==='ETLS')return 'SMTP отклонил защищённое TLS-соединение.';
 return 'Не удалось проверить SMTP. Проверьте пароль приложения и настройки почтовых клиентов.';
}
export async function verifyEmailConnection(){
 if(!emailReady())throw new AppError('Доставка писем не настроена.',503);
 if(emailProvider()==='brevo'){
  const result=await mailApi('senders',{});
  const senders=result.senders;
  if(!Array.isArray(senders)||!senders.some((sender: {email?:string;active?:boolean})=>sender.email?.toLowerCase()===senderAddress().toLowerCase()&&sender.active===true))throw new MailApiError('MAIL_SENDER');
  return;
 }
 const port=Number(process.env.SMTP_PORT||465);
 const smtp=nodemailer.createTransport({host:process.env.SMTP_HOST||'smtp.yandex.ru',port,secure:port===465,requireTLS:port!==465,auth:{user:process.env.SMTP_USER||'polka.sluzhbazaboty@yandex.ru',pass:process.env.SMTP_PASSWORD},connectionTimeout:10000,socketTimeout:15000,logger:false,debug:false});
 try{await smtp.verify()}finally{smtp.close()}
}
export const mailDelivery={async send(email:string,code:string){
 if(!emailReady())throw new AppError('Регистрация по почте ещё настраивается. Вход в существующий аккаунт доступен.',503);
 if(emailProvider()==='brevo'){
  try{
   const result=await mailApi('smtp/email',{sender:{name:'polka',email:senderAddress()},replyTo:{name:'polka',email:senderAddress()},to:[{email}],subject:'Код подтверждения polka',textContent:`Ваш код подтверждения: ${code}\n\nОн действует 10 минут. Никому не сообщайте код. Если вы не запрашивали его, просто проигнорируйте это письмо.`});
   if(typeof result.messageId!=='string'||!result.messageId)throw new MailApiError('MAIL_API');
  }catch{throw new AppError('Не удалось отправить письмо. Проверьте адрес и попробуйте позже.',503)}
  return;
 }
 const user=process.env.SMTP_USER||'polka.sluzhbazaboty@yandex.ru';
 const port=Number(process.env.SMTP_PORT||465);
 const smtp=nodemailer.createTransport({host:process.env.SMTP_HOST||'smtp.yandex.ru',port,secure:port===465,requireTLS:port!==465,auth:{user,pass:process.env.SMTP_PASSWORD},connectionTimeout:10000,socketTimeout:15000,logger:false,debug:false});
 try{await smtp.sendMail({from:{name:'polka',address:user},to:email,subject:'Код подтверждения polka',text:`Ваш код подтверждения: ${code}\n\nОн действует 10 минут. Никому не сообщайте код. Если вы не запрашивали его, просто проигнорируйте это письмо.`})}catch{throw new AppError('Не удалось отправить письмо. Проверьте адрес и попробуйте позже.',503)}finally{smtp.close()}
}};
