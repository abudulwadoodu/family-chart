import { EditDatumFormCreator, NewRelFormCreator } from '../types/form'
import { getHtmlEdit, getHtmlNew } from './create-form-html'


export function createFormNew(form_creator: NewRelFormCreator, closeCallback: () => void) {
  return createForm(form_creator, closeCallback)
}

export function createFormEdit(form_creator: EditDatumFormCreator, closeCallback: () => void) {
  return createForm(form_creator, closeCallback)
}

function createForm(form_creator: EditDatumFormCreator | NewRelFormCreator, closeCallback: () => void) {
  const is_new = isNewRelFormCreator(form_creator)
  const formContainer = document.createElement('div')
  reload()
  return formContainer

  function reload() {
    const formHtml = is_new ? getHtmlNew(form_creator) : getHtmlEdit(form_creator)
    formContainer.innerHTML = formHtml;
    setupEventListenersBase(formContainer, form_creator, closeCallback, reload)
    setupDateFields(formContainer)
    if (is_new) setupEventListenersNew(formContainer, form_creator)
    else setupEventListenersEdit(formContainer, form_creator, reload)
    if (form_creator.onFormCreation) {
      form_creator.onFormCreation({
        cont: formContainer,
        form_creator: form_creator
      })
    }
  }

  function isNewRelFormCreator(form_creator: EditDatumFormCreator | NewRelFormCreator): form_creator is NewRelFormCreator {
    return 'new_rel' in form_creator
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// Reformats a partial/full YYYY-MM-DD string from its raw digits, inserting
// hyphens as soon as the year/month segment is complete - i.e. right after
// the 4th and 6th digit - rather than waiting for the first digit of the
// next segment, so the hyphen shows up before the user has to guess it's
// coming.
function formatDateDigits(digits: string) {
  const year = digits.slice(0, 4)
  const month = digits.slice(4, 6)
  const day = digits.slice(6, 8)
  let out = year
  if (year.length === 4 && digits.length >= 4) out += '-' + month
  if (month.length === 2 && digits.length >= 6) out += '-' + day
  return out
}

function setupDateFields(formContainer: HTMLElement) {
  formContainer.querySelectorAll('.f3-form-field-date').forEach(field_cont => {
    const text_input = field_cont.querySelector('.f3-date-text-input') as HTMLInputElement | null
    const picker_input = field_cont.querySelector('.f3-date-picker-input') as HTMLInputElement | null
    const picker_btn = field_cont.querySelector('.f3-date-picker-btn') as HTMLButtonElement | null
    if (!text_input || !picker_input || !picker_btn) return

    // Since hyphens are now inserted eagerly (right after the year/month is
    // complete, before the next digit exists), a lone Backspace right after
    // one of those hyphens deletes only the hyphen character - which
    // formatDateDigits then immediately re-adds because the underlying
    // digits haven't changed, silently swallowing the keystroke. Track
    // whether the deletion is a plain backspace/forward-delete of a
    // non-digit so the input handler can drop an extra digit in that case.
    let deletingSeparator = false
    text_input.addEventListener('beforeinput', (e: InputEvent) => {
      if (e.inputType !== 'deleteContentBackward' && e.inputType !== 'deleteContentForward') return
      const start = text_input.selectionStart ?? 0
      const end = text_input.selectionEnd ?? start
      if (start !== end) return  // real range selection, not a bare caret delete
      const deletedChar = e.inputType === 'deleteContentBackward'
        ? text_input.value[start - 1]
        : text_input.value[start]
      deletingSeparator = deletedChar === '-'
    })

    text_input.addEventListener('input', () => {
      // Count digits before the caret in the old value so the caret can be
      // restored at the same digit position after reformatting - typing or
      // backspacing mid-string would otherwise jump the caret to the end.
      const caret = text_input.selectionStart ?? text_input.value.length
      let digitsBeforeCaret = text_input.value.slice(0, caret).replace(/\D/g, '').length

      let digits = text_input.value.replace(/\D/g, '').slice(0, 8)
      if (deletingSeparator) {
        digits = digits.slice(0, -1)
        digitsBeforeCaret = Math.max(0, digitsBeforeCaret - 1)
      }
      deletingSeparator = false
      text_input.value = formatDateDigits(digits)

      let newCaret = 0
      let seen = 0
      while (newCaret < text_input.value.length && seen < digitsBeforeCaret) {
        if (/\d/.test(text_input.value[newCaret])) seen++
        newCaret++
      }
      // Auto-inserted hyphens sit right after their segment's last digit -
      // e.g. "1990-" once the year is complete, before any month digit has
      // been typed. Landing the caret right before that hyphen would put the
      // next keystroke between the digit and the hyphen instead of after it,
      // so skip over a hyphen immediately following the caret.
      if (text_input.value[newCaret] === '-') newCaret++
      text_input.setSelectionRange(newCaret, newCaret)
    })

    picker_btn.addEventListener('click', () => {
      if (DATE_RE.test(text_input.value)) picker_input.value = text_input.value
      if (typeof picker_input.showPicker === 'function') picker_input.showPicker()
      else picker_input.click()
    })

    picker_input.addEventListener('change', () => {
      text_input.value = picker_input.value
    })
  })
}

function setupEventListenersBase(formContainer: HTMLElement, form_creator: EditDatumFormCreator | NewRelFormCreator, closeCallback: () => void, reload: () => void) {
  const form = formContainer.querySelector('form')!;
  form.addEventListener('submit', form_creator.onSubmit);

  const cancel_btn = form.querySelector('.f3-cancel-btn')!;
  cancel_btn.addEventListener('click', onCancel)

  const close_btn = form.querySelector('.f3-close-btn')!;
  close_btn.addEventListener('click', closeCallback)

  function onCancel() {
    form_creator.editable = false
    if (form_creator.onCancel) form_creator.onCancel()
    reload()
  }
}

function setupEventListenersNew(formContainer: HTMLElement, form_creator: NewRelFormCreator) {
  const form = formContainer.querySelector('form')!;
  const link_existing_relative_select = form.querySelector('.f3-link-existing-relative select')!;
  if (link_existing_relative_select) {
    link_existing_relative_select.addEventListener('change', form_creator.linkExistingRelative.onSelect);
  }
}

function setupEventListenersEdit(formContainer: HTMLElement, form_creator: EditDatumFormCreator, reload: () => void) {
  const form = formContainer.querySelector('form')!;

  const edit_btn = form.querySelector('.f3-edit-btn');
  if (edit_btn) edit_btn.addEventListener('click', onEdit)

  const delete_btn = form.querySelector('.f3-delete-btn');
  if (delete_btn && form_creator.onDelete) {
    delete_btn.addEventListener('click', form_creator.onDelete);
  }

  const add_relative_btn = form.querySelector('.f3-add-relative-btn');
  if (add_relative_btn && form_creator.addRelative) {
    add_relative_btn.addEventListener('click', () => {
      if (form_creator.addRelativeActive) form_creator.addRelativeCancel()
      else form_creator.addRelative()
      form_creator.addRelativeActive = !form_creator.addRelativeActive
      reload()
    });
  }

  const remove_relative_btn = form.querySelector('.f3-remove-relative-btn');
  if (remove_relative_btn && form_creator.removeRelative) {
    remove_relative_btn.addEventListener('click', () => {
      if (form_creator.removeRelativeActive) form_creator.removeRelativeCancel()
      else form_creator.removeRelative()
      form_creator.removeRelativeActive = !form_creator.removeRelativeActive
      reload()
    });
  }

  const link_existing_relative_select = form.querySelector('.f3-link-existing-relative select');
  if (link_existing_relative_select) {
    link_existing_relative_select.addEventListener('change', form_creator.linkExistingRelative.onSelect);
  }

  function onEdit() {
    form_creator.editable = !form_creator.editable
    reload()
  }
}