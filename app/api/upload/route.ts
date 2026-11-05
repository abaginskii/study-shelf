import {json} from '@/lib/http';

// Large files went straight to Vercel Blob, which is paused. Files up to 4 MB still go through the regular upload.
export async function POST(){return json({error:'Сейчас можно загружать файлы до 4 МБ. Большие файлы временно недоступны.'},503)}
