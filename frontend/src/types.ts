export type Role = "general_admin" | "property_admin" | "owner" | "operator";
export const roleNames: Record<Role, string> = {
  general_admin: "Administrador general",
  property_admin: "Administrador de propiedades",
  owner: "Propietario",
  operator: "Operador",
};
export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  person_id: number;
  display_name: string | null;
  is_active: boolean;
  property_ids: number[];
}
export interface Person {
  id: number;
  full_name: string;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_owner: boolean;
}
export interface Property {
  id: number;
  name: string;
  address: string | null;
  zone: string | null;
  city: string;
  description: string | null;
  is_active: boolean;
  owners: { person_id: number; share: string | number | null }[];
  manager_ids: number[];
}
export interface Unit {
  id: number;
  property_id: number;
  code: string;
  name: string;
  unit_type: string;
  description: string | null;
  maintenance: boolean;
  is_enabled: boolean;
  notes: string | null;
}
