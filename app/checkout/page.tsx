import {Suspense} from 'react';
import type {Metadata} from 'next';
import Checkout from '@/components/billing/checkout';
import './checkout.css';
export const metadata:Metadata={title:'Оформление подписки — polka',robots:{index:false,follow:false}};
export default function CheckoutPage(){return <Suspense fallback={<main className="checkout-root">Загружаем оформление…</main>}><Checkout/></Suspense>}
