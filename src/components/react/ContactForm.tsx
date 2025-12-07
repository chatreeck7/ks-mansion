import { useState } from 'react';
import type { FormEvent } from 'react';

interface FormData {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

export default function ContactForm() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    console.log('Contact Form Data:', formData);

    // Show success message
    setMessage({
      type: 'success',
      text: `Thank you, ${formData.name}! Your message has been received. We will respond to ${formData.email} within 24 hours.`,
    });

    // Reset form
    setFormData({
      name: '',
      email: '',
      phone: '',
      subject: '',
      message: '',
    });

    // Clear message after 10 seconds
    setTimeout(() => setMessage(null), 10000);
  };

  return (
    <div>
      {message && (
        <div className={`p-4 rounded mb-5 ${message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex flex-col">
            <label htmlFor="name" className="mb-2 text-primary font-medium">Name *</label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors"
            />
          </div>
          <div className="flex flex-col">
            <label htmlFor="email" className="mb-2 text-primary font-medium">Email *</label>
            <input
              type="email"
              id="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <div className="flex flex-col">
          <label htmlFor="phone" className="mb-2 text-primary font-medium">Phone Number</label>
          <input
            type="tel"
            id="phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div className="flex flex-col">
          <label htmlFor="subject" className="mb-2 text-primary font-medium">Subject *</label>
          <select
            id="subject"
            required
            value={formData.subject}
            onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
            className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors"
          >
            <option value="">Select a subject</option>
            <option value="general">General Inquiry</option>
            <option value="reservation">Reservation Question</option>
            <option value="events">Special Events</option>
            <option value="dining">Dining Reservation</option>
            <option value="feedback">Feedback</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="flex flex-col">
          <label htmlFor="message" className="mb-2 text-primary font-medium">Message *</label>
          <textarea
            id="message"
            rows={6}
            required
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors resize-none"
          />
        </div>

        <button type="submit" className="btn btn-primary">
          Send Message
        </button>
        <p className="text-sm text-text-light">
          * Required fields. We'll respond within 24 hours.
        </p>
      </form>
    </div>
  );
}
