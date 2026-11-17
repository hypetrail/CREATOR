import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Calori Go · Reserve sua moto elétrica',description:'Escolha sua moto elétrica e as datas, consulte a disponibilidade e reserve sem cadastro, com pagamento na retirada.',robots:{index:false,follow:false},icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>;}
