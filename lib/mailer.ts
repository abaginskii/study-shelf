import nodemailer from 'nodemailer';
import {AppError} from './storage';
export const emailReady=()=>!!process.env.SMTP_PASSWORD;
// Whitelisted transport categories only; raw SMTP responses can contain account data.
export function emailConnectionHint(reason:unknown){
 const error=reason&&typeof reason==='object'?reason as {code?:unknown;responseCode?:unknown}:{};
 const status=typeof error.responseCode==='number'&&error.responseCode>=100&&error.responseCode<=599?` (SMTP ${error.responseCode})`:'';
 if(error.code==='EAUTH')return `Яндекс отклонил вход${status}. Проверьте пароль приложения «Почта» для polka.sluzhbazaboty@yandex.ru и разрешение почтовых клиентов.`;
 if(error.code==='ETIMEDOUT')return 'SMTP не ответил вовремя. Проверьте доступность почтового сервера.';
 if(error.code==='EDNS')return 'Не удалось определить адрес SMTP-сервера.';
 if(error.code==='ESOCKET'||error.code==='ECONNECTION')return 'SMTP-соединение прервано. Проверьте сеть и TLS-подключение.';
 if(error.code==='ETLS')return 'SMTP отклонил защищённое TLS-соединение.';
 return 'Не удалось проверить SMTP. Проверьте пароль приложения и настройки почтовых клиентов.';
}
export async function verifyEmailConnection(){
 if(!emailReady())throw new AppError('SMTP не настроен.',503);
 const port=Number(process.env.SMTP_PORT||465);
 const smtp=nodemailer.createTransport({host:process.env.SMTP_HOST||'smtp.yandex.ru',port,secure:port===465,requireTLS:port!==465,auth:{user:process.env.SMTP_USER||'polka.sluzhbazaboty@yandex.ru',pass:process.env.SMTP_PASSWORD},connectionTimeout:10000,socketTimeout:15000,logger:false,debug:false});
 try{await smtp.verify()}finally{smtp.close()}
}
export const mailDelivery={async send(email:string,code:string){
 if(!emailReady())throw new AppError('Регистрация по почте ещё настраивается. Вход в существующий аккаунт доступен.',503);
 const user=process.env.SMTP_USER||'polka.sluzhbazaboty@yandex.ru';
 const port=Number(process.env.SMTP_PORT||465);
 const smtp=nodemailer.createTransport({host:process.env.SMTP_HOST||'smtp.yandex.ru',port,secure:port===465,requireTLS:port!==465,auth:{user,pass:process.env.SMTP_PASSWORD},connectionTimeout:10000,socketTimeout:15000,logger:false,debug:false});
 try{await smtp.sendMail({from:{name:'polka',address:user},to:email,subject:'Код подтверждения polka',text:`Ваш код подтверждения: ${code}\n\nОн действует 10 минут. Никому не сообщайте код. Если вы не запрашивали его, просто проигнорируйте это письмо.`})}catch{throw new AppError('Не удалось отправить письмо. Проверьте адрес и попробуйте позже.',503)}finally{smtp.close()}
}};
