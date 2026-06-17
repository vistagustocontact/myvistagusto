-- ============================================
-- VISTAGUSTO — Supabase Database Setup
-- Run this entire file in the SQL Editor
-- ============================================


-- PROFILES (extends Supabase auth.users with role)
create table profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null check (role in ('admin', 'restaurant')),
  restaurant_id uuid,
  created_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'role', 'restaurant'));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- RESTAURANTS
create table restaurants (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  email text unique not null,
  phone text,
  address text,
  logo_url text,
  slug text unique not null,
  plan text not null default 'starter' check (plan in ('starter', 'premium', 'enterprise')),
  status text not null default 'trial' check (status in ('active', 'trial', 'cancelled', 'suspended')),
  staff_count int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- MENUS
create table menus (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  name text not null,
  language text default 'FR',
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- CATEGORIES
create table categories (
  id uuid default gen_random_uuid() primary key,
  menu_id uuid references menus(id) on delete cascade not null,
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  name text not null,
  position int default 0,
  created_at timestamptz default now()
);


-- DISHES
create table dishes (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  menu_id uuid references menus(id) on delete cascade not null,
  category_id uuid references categories(id) on delete set null,
  name text not null,
  description text,
  price decimal(10,2),
  photo_url text,
  model_3d_url text,
  model_ar_url text,
  has_3d boolean default false,
  has_ar boolean default false,
  is_active boolean default true,
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- TICKETS
create table tickets (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  subject text not null,
  type text not null check (type in ('3D Request', 'Technical Issue', 'Billing', 'General Support')),
  status text not null default 'Open' check (status in ('Open', 'In Progress', 'Waiting', 'Resolved', 'Closed')),
  priority text not null default 'Normal' check (priority in ('High', 'Normal')),
  assigned_to text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- TICKET MESSAGES
create table ticket_messages (
  id uuid default gen_random_uuid() primary key,
  ticket_id uuid references tickets(id) on delete cascade not null,
  from_role text not null check (from_role in ('restaurant', 'support')),
  content text not null,
  created_at timestamptz default now()
);


-- SUBSCRIPTIONS
create table subscriptions (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references restaurants(id) on delete cascade not null unique,
  plan text not null default 'starter' check (plan in ('starter', 'premium', 'enterprise')),
  status text not null default 'trial' check (status in ('active', 'trial', 'overdue', 'cancelled')),
  price_monthly decimal(10,2) default 0,
  next_invoice_date date,
  payment_method text,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);


-- ANALYTICS EVENTS
create table analytics_events (
  id uuid default gen_random_uuid() primary key,
  restaurant_id uuid references restaurants(id) on delete cascade not null,
  dish_id uuid references dishes(id) on delete set null,
  event_type text not null check (event_type in ('qr_scan', 'menu_view', 'dish_view', 'ar_view', '3d_view')),
  created_at timestamptz default now()
);


-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

alter table profiles enable row level security;
alter table restaurants enable row level security;
alter table menus enable row level security;
alter table categories enable row level security;
alter table dishes enable row level security;
alter table tickets enable row level security;
alter table ticket_messages enable row level security;
alter table subscriptions enable row level security;
alter table analytics_events enable row level security;

-- Helper: is current user an admin?
create or replace function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer;

-- Helper: get current user's restaurant_id
create or replace function my_restaurant_id()
returns uuid as $$
  select restaurant_id from profiles where id = auth.uid();
$$ language sql security definer;


-- PROFILES policies
create policy "Users can read own profile"
  on profiles for select using (id = auth.uid());

create policy "Admins can read all profiles"
  on profiles for select using (is_admin());


-- RESTAURANTS policies
create policy "Admins can do everything on restaurants"
  on restaurants for all using (is_admin());

create policy "Restaurants can read their own row"
  on restaurants for select using (id = my_restaurant_id());


-- MENUS policies
create policy "Admins can do everything on menus"
  on menus for all using (is_admin());

create policy "Restaurants can read/write their own menus"
  on menus for all using (restaurant_id = my_restaurant_id());

create policy "Public can read active menus"
  on menus for select using (is_active = true);


-- CATEGORIES policies
create policy "Admins can do everything on categories"
  on categories for all using (is_admin());

create policy "Restaurants can manage their own categories"
  on categories for all using (restaurant_id = my_restaurant_id());

create policy "Public can read categories"
  on categories for select using (true);


-- DISHES policies
create policy "Admins can do everything on dishes"
  on dishes for all using (is_admin());

create policy "Restaurants can manage their own dishes"
  on dishes for all using (restaurant_id = my_restaurant_id());

create policy "Public can read active dishes"
  on dishes for select using (is_active = true);


-- TICKETS policies
create policy "Admins can do everything on tickets"
  on tickets for all using (is_admin());

create policy "Restaurants can read/create their own tickets"
  on tickets for all using (restaurant_id = my_restaurant_id());


-- TICKET MESSAGES policies
create policy "Admins can do everything on ticket_messages"
  on ticket_messages for all using (is_admin());

create policy "Restaurants can read/write messages on their tickets"
  on ticket_messages for all using (
    exists (
      select 1 from tickets
      where tickets.id = ticket_messages.ticket_id
      and tickets.restaurant_id = my_restaurant_id()
    )
  );


-- SUBSCRIPTIONS policies
create policy "Admins can do everything on subscriptions"
  on subscriptions for all using (is_admin());

create policy "Restaurants can read their own subscription"
  on subscriptions for select using (restaurant_id = my_restaurant_id());


-- ANALYTICS policies
create policy "Admins can read all analytics"
  on analytics_events for select using (is_admin());

create policy "Restaurants can read their own analytics"
  on analytics_events for select using (restaurant_id = my_restaurant_id());

create policy "Anyone can insert analytics events"
  on analytics_events for insert with check (true);


-- ============================================
-- STORAGE BUCKETS
-- ============================================

insert into storage.buckets (id, name, public)
values
  ('dish-photos', 'dish-photos', true),
  ('3d-models', '3d-models', true),
  ('logos', 'logos', true);
