import {requireUser} from '@/lib/auth';import {getLibrary} from '@/lib/storage';import {json,route} from '@/lib/http';
import {subjectFolders,resolveSubjectName,subjectNameMap} from '@/lib/subjects';
export const dynamic='force-dynamic';
export async function GET(){return route(async()=>{const user=await requireUser();const lib=await getLibrary(user.id);const names=subjectNameMap(lib);return json({subjects:subjectFolders(lib),materials:lib.materials.map(material=>({...material,subject:resolveSubjectName(lib,material.subject,names)})),topics:lib.topics,stats:{materials:lib.materials.length,topics:lib.topics.length,inbox:lib.materials.filter(x=>x.status==='inbox').length,reviews:lib.reviews}})})}
