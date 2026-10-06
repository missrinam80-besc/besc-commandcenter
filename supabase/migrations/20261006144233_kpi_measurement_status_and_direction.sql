begin;
alter table public.kpi_records
  alter column value drop not null,
  add column measurement_status text not null default 'measured',
  add column target_direction text not null default 'unknown';
-- Existing numeric facts remain unchanged; no direction is inferred from metric names.
alter table public.kpi_records
  add constraint kpi_measurement_status_check check (measurement_status in ('measured','missing')),
  add constraint kpi_target_direction_check check (target_direction in ('unknown','higher','lower')),
  add constraint kpi_measurement_value_check check (
    (measurement_status = 'measured' and value is not null)
    or (measurement_status = 'missing' and value is null)
  ),
  add constraint kpi_finite_numbers_check check (
    (value is null or value not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))
    and (target is null or target not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric))
  );
-- Existing RLS, grants and audit triggers are retained.
commit;
