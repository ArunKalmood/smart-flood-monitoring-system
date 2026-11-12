import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '../Modal';
import FaqList from '../FaqList';
import ErrorBoundary from '../ErrorBoundary';
import { LanguageProvider } from '../../../context/LanguageContext';

const wrap = (ui) => render(<LanguageProvider>{ui}</LanguageProvider>);

function Harness({ onClose }) {
  const [open, setOpen] = useState(false);
  const close = () => { onClose(); setOpen(false); };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>open</button>
      <Modal open={open} onClose={close} title="Test dialog">
        <input aria-label="first" />
        <button type="button">last</button>
      </Modal>
    </>
  );
}

describe('Modal', () => {
  test('Esc closes it and focus returns to the opener', async () => {
    const onClose = jest.fn();
    wrap(<Harness onClose={onClose} />);
    const opener = screen.getByText('open');
    await userEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Test dialog' })).toBeInTheDocument();
    expect(screen.getByLabelText('first')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  test('backdrop click closes it', async () => {
    const onClose = jest.fn();
    wrap(<Harness onClose={onClose} />);
    await userEvent.click(screen.getByText('open'));
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  test('Tab is trapped inside the dialog', async () => {
    wrap(<Harness onClose={() => {}} />);
    await userEvent.click(screen.getByText('open'));
    await userEvent.click(screen.getByText('last'));
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(screen.getByText('last')).toHaveFocus();
  });
});

test('FAQ items are buttons with aria-expanded', async () => {
  wrap(<FaqList items={[{ q: 'Question?', a: 'Answer.' }]} />);
  const button = screen.getByRole('button', { name: 'Question?' });
  expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByText('Answer.')).not.toBeVisible();
  await userEvent.click(button);
  expect(button).toHaveAttribute('aria-expanded', 'true');
  expect(screen.getByText('Answer.')).toBeVisible();
});

test('ErrorBoundary renders a message even when a non-Error object is thrown', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const Bomb = () => { throw { type: 'value_error', loc: ['body'], msg: 'x' }; }; // eslint-disable-line no-throw-literal
  render(<ErrorBoundary><Bomb /></ErrorBoundary>);
  expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  spy.mockRestore();
});
