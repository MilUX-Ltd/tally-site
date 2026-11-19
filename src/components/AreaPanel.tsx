// The companies in the area the user picked on the map.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import CompanyItem from './CompanyItem';
import type { Company } from '../lib/types';

interface Props {
  companies: Company[];
  onClear: () => void;
  actions?: (company: Company) => ComponentChildren;
}

export default function AreaPanel({ companies, onClear, actions }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  const key = companies.map((c) => c.id).join(',');
  useEffect(() => {
    heading.current?.focus();
  }, [key]);
  const n = companies.length;
  return (
    <section class="area" aria-label="Companies in this area">
      <h2 ref={heading} tabIndex={-1}>
        {n === 1 ? '1 company in this area' : `${n} companies in this area`}
      </h2>
      <button type="button" class="secondary" onClick={onClear}>
        Clear the area
      </button>
      {n > 0 && (
        <ul class="company-list">
          {companies.map((c) => (
            <CompanyItem key={c.id} company={c}>
              {actions?.(c)}
            </CompanyItem>
          ))}
        </ul>
      )}
    </section>
  );
}
