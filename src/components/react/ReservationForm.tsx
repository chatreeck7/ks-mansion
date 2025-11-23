import { useState, FormEvent } from 'react';

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  guests: number;
  specialRequests: string;
  addons: string[];
}

export default function ReservationForm() {
  const today = new Date().toISOString().split('T')[0];
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    checkIn: '',
    checkOut: '',
    roomType: '',
    guests: 2,
    specialRequests: '',
    addons: [],
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate dates
    const checkIn = new Date(formData.checkIn);
    const checkOut = new Date(formData.checkOut);

    if (checkOut <= checkIn) {
      setMessage({ type: 'error', text: 'Check-out date must be after check-in date.' });
      return;
    }

    // Calculate nights
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    console.log('Reservation Data:', { ...formData, nights });

    // Show success message
    setMessage({
      type: 'success',
      text: `Thank you, ${formData.firstName}! Your reservation request for ${nights} night(s) has been received. We will contact you at ${formData.email} within 24 hours to confirm.`,
    });

    // Reset form
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      checkIn: '',
      checkOut: '',
      roomType: '',
      guests: 2,
      specialRequests: '',
      addons: [],
    });

    // Clear message after 10 seconds
    setTimeout(() => setMessage(null), 10000);
  };

  const handleCheckInChange = (value: string) => {
    setFormData({ ...formData, checkIn: value });
    // Reset checkout if it's before the new checkin
    if (formData.checkOut && new Date(formData.checkOut) <= new Date(value)) {
      setFormData(prev => ({ ...prev, checkOut: '' }));
    }
  };

  const handleAddonChange = (addon: string, checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      addons: checked ? [...prev.addons, addon] : prev.addons.filter(a => a !== addon),
    }));
  };

  const minCheckOut = formData.checkIn
    ? new Date(new Date(formData.checkIn).getTime() + 86400000).toISOString().split('T')[0]
    : today;

  return (
    <div>
      {message && (
        <div className={`p-4 rounded mb-5 ${message.type === 'success' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-8">
        {/* Guest Information */}
        <div className="pb-8 border-b border-gray-200">
          <h3 className="text-primary mb-5 text-xl">Guest Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col">
              <label htmlFor="firstName" className="mb-2 text-primary font-medium">First Name *</label>
              <input
                type="text"
                id="firstName"
                required
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="lastName" className="mb-2 text-primary font-medium">Last Name *</label>
              <input
                type="text"
                id="lastName"
                required
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
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
            <div className="flex flex-col">
              <label htmlFor="phone" className="mb-2 text-primary font-medium">Phone Number *</label>
              <input
                type="tel"
                id="phone"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Stay Details */}
        <div className="pb-8 border-b border-gray-200">
          <h3 className="text-primary mb-5 text-xl">Stay Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="flex flex-col">
              <label htmlFor="checkIn" className="mb-2 text-primary font-medium">Check-in Date *</label>
              <input
                type="date"
                id="checkIn"
                required
                min={today}
                value={formData.checkIn}
                onChange={(e) => handleCheckInChange(e.target.value)}
                className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="checkOut" className="mb-2 text-primary font-medium">Check-out Date *</label>
              <input
                type="date"
                id="checkOut"
                required
                min={minCheckOut}
                value={formData.checkOut}
                onChange={(e) => setFormData({ ...formData, checkOut: e.target.value })}
                className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors"
              />
            </div>
            <div className="flex flex-col">
              <label htmlFor="roomType" className="mb-2 text-primary font-medium">Room Type *</label>
              <select
                id="roomType"
                required
                value={formData.roomType}
                onChange={(e) => setFormData({ ...formData, roomType: e.target.value })}
                className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors"
              >
                <option value="">Select a room type</option>
                <option value="garden">Garden Room</option>
                <option value="deluxe">Deluxe Suite</option>
                <option value="master">Master Suite</option>
                <option value="presidential">Presidential Suite</option>
              </select>
            </div>
            <div className="flex flex-col">
              <label htmlFor="guests" className="mb-2 text-primary font-medium">Number of Guests *</label>
              <input
                type="number"
                id="guests"
                min="1"
                max="4"
                required
                value={formData.guests}
                onChange={(e) => setFormData({ ...formData, guests: parseInt(e.target.value) })}
                className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Special Requests */}
        <div className="pb-8 border-b border-gray-200">
          <h3 className="text-primary mb-5 text-xl">Special Requests</h3>
          <div className="flex flex-col">
            <label htmlFor="specialRequests" className="mb-2 text-primary font-medium">Any special requests or requirements?</label>
            <textarea
              id="specialRequests"
              rows={4}
              value={formData.specialRequests}
              onChange={(e) => setFormData({ ...formData, specialRequests: e.target.value })}
              placeholder="Please let us know if you have any special requirements or preferences..."
              className="p-3 border border-gray-300 rounded focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </div>
        </div>

        {/* Add-ons */}
        <div className="pb-8">
          <h3 className="text-primary mb-5 text-xl">Enhance Your Stay</h3>
          <div className="flex flex-col gap-4">
            {[
              { value: 'spa', label: 'Spa Treatment Package' },
              { value: 'dining', label: 'Private Dining Experience' },
              { value: 'airport', label: 'Airport Transfer Service' },
              { value: 'tour', label: 'Guided Estate Tour' },
            ].map((addon) => (
              <label key={addon.value} className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.addons.includes(addon.value)}
                  onChange={(e) => handleAddonChange(addon.value, e.target.checked)}
                  className="mr-3 w-5 h-5 cursor-pointer"
                />
                <span className="select-none">{addon.label}</span>
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-full">
          Submit Reservation Request
        </button>
        <p className="text-sm text-text-light mt-2">
          * Required fields. We will contact you within 24 hours to confirm your reservation.
        </p>
      </form>
    </div>
  );
}
