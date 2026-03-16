import { Component, Show } from 'solid-js';

interface LoadingProps {
  fullscreen?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Loading: Component<LoadingProps> = (props) => {
  const sizeMap = {
    sm: '20px',
    md: '30px',
    lg: '40px',
  };

  const size = sizeMap[props.size || 'md'];

  const LoadingSpinner = () => (
    <div
      style={{
        width: size,
        height: size,
        'box-sizing': 'border-box',
        'border-radius': '50%',
        'box-shadow': '0 -10px 0 13px rgba(255, 255, 255, 0.6) inset',
        animation: 'loading-rotate 1s infinite linear',
      }}
    />
  );

  return (
    <Show
      when={props.fullscreen}
      fallback={<LoadingSpinner />}
    >
      {/* Fullscreen loading overlay */}
      <div
        class="fixed inset-0 flex items-center justify-center"
        style={{
          'z-index': '99',
          'background-color': 'rgba(0, 0, 0, 0.3)',
        }}
      >
        <LoadingSpinner />
      </div>

      <style>{`
        @keyframes loading-rotate {
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </Show>
  );
};

export default Loading;
