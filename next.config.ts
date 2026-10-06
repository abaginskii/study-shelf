import type {NextConfig} from 'next';
const config:NextConfig={...(!process.env.VERCEL&&process.env.POLKA_STANDALONE==='true'?{output:'standalone' as const}:{}),poweredByHeader:false,serverExternalPackages:['pdfjs-dist'],async headers(){return [{source:'/(.*)',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'X-Frame-Options',value:'DENY'},{key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},{key:'Permissions-Policy',value:'camera=(self), microphone=(), geolocation=()'}]}]}};
export default config;
