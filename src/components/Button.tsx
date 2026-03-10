import React from 'react';

interface ButtonProps {
  text: string;
  variant?: 'primary' | 'secondary' | 'cta';
  href?: string;
  onClick?: () => void;
}

export default function Button({ text, variant = 'primary', href, onClick }: ButtonProps) {
  const className = variant === 'cta' ? 'btn-cta' : `button button--${variant}`;
  
  if (href) {
    return (
      <a href={href} className={className}>
        {text}
      </a>
    );
  }
  
  return (
    <button className={className} onClick={onClick}>
      {text}
    </button>
  );
}
