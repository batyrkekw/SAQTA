import React, { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { Modal } from '../src/components/ui';

it('keeps keyboard focus within the modal and restores its trigger on escape', async () => {
  function Example() { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Добавить</button>{open && <Modal title="Новая запись" onClose={() => setOpen(false)}><input aria-label="Количество"/><button>Сохранить</button></Modal>}</>; }
  const user = userEvent.setup(); render(<Example/>);
  const trigger = screen.getByRole('button', { name: 'Добавить' });
  await user.click(trigger);
  expect(screen.getByRole('button', {name: 'Закрыть'})).toHaveFocus();
  await user.tab({shift: true});
  expect(screen.getByRole('button', {name: 'Сохранить'})).toHaveFocus();
  await user.tab();
  expect(screen.getByRole('button', {name: 'Закрыть'})).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
