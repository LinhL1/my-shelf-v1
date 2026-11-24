import type { ReactNode, SVGProps } from 'react';

function icon(children: ReactNode) {
  return function Icon(props: SVGProps<SVGSVGElement>) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...props}
      >
        {children}
      </svg>
    );
  };
}

export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const CloseIcon = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4 4" />
  </>,
);
export const ChevronLeftIcon = icon(<path d="M14.5 5.5L8 12l6.5 6.5" />);
export const ChevronRightIcon = icon(<path d="M9.5 5.5L16 12l-6.5 6.5" />);
export const ChevronDownIcon = icon(<path d="M6 9l6 6 6-6" />);
export const MoreIcon = icon(
  <g fill="currentColor" stroke="none">
    <circle cx="5.5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="18.5" cy="12" r="1.5" />
  </g>,
);
export const ExpandIcon = icon(<path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" />);
export const CollapseIcon = icon(<path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5" />);
export const SinglePageIcon = icon(<rect x="7" y="4.5" width="10" height="15" rx="1" />);
export const DoublePageIcon = icon(
  <>
    <rect x="3.5" y="5.5" width="17" height="13" rx="1" />
    <path d="M12 5.5v13" />
  </>,
);
export const CheckIcon = icon(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const AlertIcon = icon(
  <>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4.5M12 15.8v.1" />
  </>,
);
