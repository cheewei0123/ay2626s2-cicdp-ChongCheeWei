import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Field } from '../components/Field';
import { Page, primaryButton } from '../components/Page';

// Step 1 of a new bill: give it a name. Then choose how to add the items.
// The bill is only created on the next page, once there is something to put in it
// (a receipt that was read, or "Type it in"), so a photo that isn't a receipt
// leaves no empty bill behind (KAN-99).
export default function NewBill() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [titleError, setTitleError] = useState('');

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = title.trim();
    // The same rule as the API's CreateBillDto
    const problem =
      name.length < 1 || name.length > 80
        ? 'Enter a name (up to 80 characters)'
        : '';
    setTitleError(problem);
    if (problem) return;
    navigate('/bills/new/scan', { state: { title: name } });
  }

  return (
    <Page title="New bill" back="/bills">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field
          label="What is this bill for?"
          name="title"
          placeholder="Dinner at Maxwell"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={titleError || undefined}
        />
        <button type="submit" className={primaryButton}>
          Next: add items
        </button>
      </form>
    </Page>
  );
}
