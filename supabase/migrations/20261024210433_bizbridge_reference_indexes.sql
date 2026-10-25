-- Cover transaction references flagged by the hosted database advisor.
begin;
create index sales_business_product_idx on public.sales(business_id, product_id);
create index stock_movements_business_product_idx on public.stock_movements(business_id, product_id);
create index stock_movements_sale_idx on public.stock_movements(sale_id);
commit;
