import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeObject, libPath, materialPath, card } from '../../lib/storage';
import { usernamePath, hashPassword, hashRecovery } from '../../lib/auth';
import { emptyLibrary, type User, type Material } from '../../lib/types';
async function main() {
 if (process.env.VERCEL) throw new Error('UI fixtures must only run locally.');
 const dir=await mkdtemp(join(tmpdir(),'polka-v2-ui-'));
 process.env.LOCAL_DATA_DIR=dir;
 const now=new Date().toISOString(), artemId=randomUUID(), materialId=randomUUID();
 const text='Рабочая память удерживает информацию на короткое время. Интервальное повторение помогает возвращаться к материалу через промежутки времени.';
 const material:Material={id:materialId,title:'Как устроена память',subject:'Психология',kind:'text',createdAt:now,updatedAt:now,status:'ready',excerpt:text,hasFile:false,text,summary:'## Два инструмента для учёбы\nРабочая память удерживает информацию ненадолго. Интервальное повторение возвращает вас к материалу через промежутки времени.',terms:['Рабочая память','Интервальное повторение'],concepts:[{title:'Рабочая память',description:'Кратковременное удержание информации во время работы с ней.',sourceQuote:'Рабочая память удерживает информацию на короткое время.'},{title:'Интервальное повторение',description:'Возвращение к материалу через промежутки времени.',sourceQuote:'Интервальное повторение помогает возвращаться к материалу через промежутки времени.'}],questions:[{question:'Для чего нужна рабочая память?',answer:'Для кратковременного удержания информации.',sourceQuote:'Рабочая память удерживает информацию на короткое время.'}],sourceVersion:1,summaryVersion:1,revision:1,aiGenerated:false};
 const library=emptyLibrary();library.materials=[card(material)];library.topics=[{id:randomUUID(),title:'Рабочая память',body:'Кратковременное удержание информации.',materialId,createdAt:now,sourceQuote:'Рабочая память удерживает информацию на короткое время.',sourceVersion:1}];
 for(const [username,id] of [['artem',artemId],['student',randomUUID()]]) {const user:User={id,username,passwordHash:hashPassword('polka-design-test-only-2026'),recoveryHash:hashRecovery('local-test'),createdAt:now,version:1};await writeObject(usernamePath(username),JSON.stringify(user),{createOnly:true});await writeObject(libPath(id),JSON.stringify(username==='artem'?library:emptyLibrary()),{createOnly:true});}
 await writeObject(materialPath(artemId,materialId),JSON.stringify(material),{createOnly:true});
 await writeFile(process.env.POLKA_TEST_FIXTURE || '/private/tmp/polka-v2-fixture.json',JSON.stringify({dir,artemId,materialId}),{mode:0o600});
 console.log('Synthetic UI fixture ready');
}
main();
