import FleetAdmin from '../fleet-admin';
import {requireChatGPTUser} from '../chatgpt-auth';
export const dynamic='force-dynamic';
export default async function AdminPage(){await requireChatGPTUser('/admin');return <FleetAdmin/>;}
