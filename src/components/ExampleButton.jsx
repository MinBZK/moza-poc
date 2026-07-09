import React from 'react';

export function ExampleButton({ text = 'Click me' }) {
  const [count, setCount] = React.useState(0);
  return (
    <button
      onClick={() => setCount(count + 1)}
      style={{
        padding: '8px 16px',
        fontSize: '14px',
        border: '1px solid #0066cc',
        borderRadius: '4px',
        backgroundColor: '#0066cc',
        color: 'white',
        cursor: 'pointer',
      }}
    >
      {text} ({count})
    </button>
  );
}
