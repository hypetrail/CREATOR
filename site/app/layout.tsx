import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Calori Go · Reserve sua moto elétrica',description:'Escolha modelo, cor e período. Consulte a disponibilidade e reserve sua moto elétrica, com pagamento na retirada.',robots:{index:false,follow:false},icons:{icon:'/favicon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>;}
