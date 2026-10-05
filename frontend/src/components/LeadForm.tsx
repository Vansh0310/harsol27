import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { submitLead } from '../lib/apiClient';
import { fetchActiveIndustries, type IndustryOption } from '../lib/industries';
import {
  BUSINESS_CATEGORY_LABELS,
  BUSINESS_CATEGORY_VALUES,
  leadFormSchema,
  type LeadFormInput,
  type LeadFormValues,
} from '../lib/validation';
import './LeadForm.css';

type IndustriesState =
  { status: 'loading' } | { status: 'ready'; industries: IndustryOption[] } | { status: 'error' };

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success' }
  | { status: 'error'; message: string };

export function LeadForm() {
  const [submitState, setSubmitState] = useState<SubmitState>({ status: 'idle' });
  const [industriesState, setIndustriesState] = useState<IndustriesState>({ status: 'loading' });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LeadFormInput, unknown, LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      fullName: '',
      phoneNumber: '',
      email: '',
      businessCategory: undefined,
      industryId: '',
      companyWebsite: '',
    },
  });

  const loadIndustries = (onCancelled?: () => boolean): void => {
    void fetchActiveIndustries().then((result) => {
      if (onCancelled?.()) return;
      setIndustriesState(
        result.ok ? { status: 'ready', industries: result.industries } : { status: 'error' },
      );
    });
  };

  useEffect(() => {
    let cancelled = false;
    loadIndustries(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (values: LeadFormValues): Promise<void> => {
    setSubmitState({ status: 'submitting' });
    const result = await submitLead(values);

    if (result.ok) {
      setSubmitState({ status: 'success' });
      reset();
      return;
    }

    if (result.error.kind === 'rate_limited') {
      setSubmitState({ status: 'error', message: result.error.message });
    } else if (result.error.kind === 'network') {
      setSubmitState({
        status: 'error',
        message: "Couldn't reach the server. Check your connection and try again.",
      });
    } else if (result.error.kind === 'validation') {
      setSubmitState({
        status: 'error',
        message: 'Please double-check the highlighted fields.',
      });
    } else {
      setSubmitState({
        status: 'error',
        message: 'Something went wrong. Please try again in a moment.',
      });
    }
  };

  if (submitState.status === 'success') {
    return (
      <div className="lead-form__success" role="status">
        <h2>Thanks - we&apos;ve got your details.</h2>
        <p>Our team will be in touch shortly.</p>
        <button type="button" onClick={() => setSubmitState({ status: 'idle' })}>
          Submit another
        </button>
      </div>
    );
  }

  const isSubmitting = submitState.status === 'submitting';

  return (
    <form className="lead-form" onSubmit={(event) => void handleSubmit(onSubmit)(event)} noValidate>
      <div className="lead-form__field">
        <label htmlFor="fullName">Full name</label>
        <input
          id="fullName"
          type="text"
          autoComplete="name"
          aria-invalid={!!errors.fullName}
          aria-describedby={errors.fullName ? 'fullName-error' : undefined}
          {...register('fullName')}
        />
        {errors.fullName && (
          <p id="fullName-error" className="lead-form__error" role="alert">
            {errors.fullName.message}
          </p>
        )}
      </div>

      <div className="lead-form__field">
        <label htmlFor="phoneNumber">Phone number</label>
        <input
          id="phoneNumber"
          type="tel"
          autoComplete="tel"
          placeholder="+91 98765 43210"
          aria-invalid={!!errors.phoneNumber}
          aria-describedby={errors.phoneNumber ? 'phoneNumber-error' : undefined}
          {...register('phoneNumber')}
        />
        {errors.phoneNumber && (
          <p id="phoneNumber-error" className="lead-form__error" role="alert">
            {errors.phoneNumber.message}
          </p>
        )}
      </div>

      <div className="lead-form__field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={!!errors.email}
          aria-describedby={errors.email ? 'email-error' : undefined}
          {...register('email')}
        />
        {errors.email && (
          <p id="email-error" className="lead-form__error" role="alert">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="lead-form__field">
        <label htmlFor="businessCategory">Business category</label>
        <select
          id="businessCategory"
          defaultValue=""
          aria-invalid={!!errors.businessCategory}
          aria-describedby={errors.businessCategory ? 'businessCategory-error' : undefined}
          {...register('businessCategory')}
        >
          <option value="" disabled>
            Select a category
          </option>
          {BUSINESS_CATEGORY_VALUES.map((value) => (
            <option key={value} value={value}>
              {BUSINESS_CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
        {errors.businessCategory && (
          <p id="businessCategory-error" className="lead-form__error" role="alert">
            {errors.businessCategory.message}
          </p>
        )}
      </div>

      <div className="lead-form__field">
        <label htmlFor="industryId">Industry</label>
        <select
          id="industryId"
          defaultValue=""
          disabled={industriesState.status !== 'ready'}
          aria-invalid={!!errors.industryId}
          aria-describedby={errors.industryId ? 'industryId-error' : undefined}
          {...register('industryId')}
        >
          <option value="" disabled>
            {industriesState.status === 'loading' ? 'Loading industries…' : 'Select an industry'}
          </option>
          {industriesState.status === 'ready' &&
            industriesState.industries.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.name}
              </option>
            ))}
        </select>
        {errors.industryId && (
          <p id="industryId-error" className="lead-form__error" role="alert">
            {errors.industryId.message}
          </p>
        )}
        {industriesState.status === 'error' && (
          <p className="lead-form__error" role="alert">
            Couldn&apos;t load the industry list.{' '}
            <button
              type="button"
              className="lead-form__retry"
              onClick={() => {
                setIndustriesState({ status: 'loading' });
                loadIndustries();
              }}
            >
              Retry
            </button>
          </p>
        )}
      </div>

      {/* Honeypot: hidden off-screen for sighted and screen-reader users
          alike, but still present for a bot that blindly fills every field
          it finds in the DOM. tabIndex -1 keeps it out of keyboard tab order. */}
      <div className="lead-form__honeypot" aria-hidden="true">
        <label htmlFor="companyWebsite">Leave this field blank</label>
        <input
          id="companyWebsite"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register('companyWebsite')}
        />
      </div>

      {submitState.status === 'error' && (
        <p
          className="lead-form__error lead-form__error--summary"
          role="alert"
          aria-live="assertive"
        >
          {submitState.message}
        </p>
      )}

      <button type="submit" disabled={isSubmitting || industriesState.status !== 'ready'}>
        {isSubmitting ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  );
}
