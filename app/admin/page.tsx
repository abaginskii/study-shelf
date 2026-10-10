import type {Metadata} from 'next';
import Link from 'next/link';
import {isOwner} from '@/lib/admin-auth';
import OwnerConsole from '@/components/admin/owner-console';
import './admin.css';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Панель владельца — polka',robots:{index:false,follow:false}};
export default async function AdminPage(){
 const allowed=await isOwner();
 if(!allowed)return <main className="owner-gate"><div className="owner-mark">П</div><h1>Панель владельца</h1><p>Войдите в свой аккаунт Полки, чтобы открыть статистику и управление сервисом.</p><Link className="owner-primary" href="/">Перейти к входу</Link><p className="owner-caption">Доступ проверяется сервером. Обычные аккаунты не получают данные пользователей.</p></main>;
 return <OwnerConsole/>;
}
