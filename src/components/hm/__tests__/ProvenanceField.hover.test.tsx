import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProvenanceField } from '../ProvenanceField';

describe('ProvenanceField certification hover', () => {
  it('paints a card id on sealed text and reports it on pointer move', () => {
    const seen: string[] = [];
    render(
      <ProvenanceField
        text="Hello world"
        spans={[{ id: 's1', start: 0, end: 11, origin: 'keyboard', certificationId: 'pt1' }]}
        placeholder=""
        ariaLabel="Paragraph"
        onCommit={() => {}}
        showProvenance
        blockId="b1"
        onCertificationHover={(id) => {
          if (id) seen.push(id);
        }}
      />,
    );
    const span = document.querySelector('.prov');
    expect(span).toHaveAttribute('data-card', 'pt1');
    fireEvent.pointerMove(span!);
    expect(seen).toEqual(['pt1']);
  });

  it('gives unspanned seed text a bare card id so the pane can scroll to it', () => {
    render(
      <ProvenanceField
        text="The wind howled."
        spans={[]}
        placeholder=""
        ariaLabel="Paragraph"
        onCommit={() => {}}
        showProvenance
        blockId="b1"
      />,
    );
    expect(document.querySelector('.prov')).toHaveAttribute('data-card', 'span:b1:bare');
  });
});
