import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionTestProgressList } from '../components/ConnectionTestProgressList';

describe('ConnectionTestProgressList', () => {
  it('shows a running indicator for the current step while testing', () => {
    render(
      <ConnectionTestProgressList
        steps={[{ name: 'ping', success: true, latencyMs: 12 }]}
        isTesting
      />,
    );

    expect(screen.getByText('Reachability')).toBeInTheDocument();
    expect(screen.getByText('12ms')).toBeInTheDocument();
    expect(screen.getByText('Model listing')).toBeInTheDocument();
    expect(screen.getByText('Running...')).toBeInTheDocument();
  });

  it('renders nothing when idle with no completed steps', () => {
    const { container } = render(
      <ConnectionTestProgressList steps={[]} isTesting={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});