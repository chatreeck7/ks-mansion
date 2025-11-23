// Reservation Form Handler
document.addEventListener('DOMContentLoaded', () => {
    const reservationForm = document.getElementById('reservationForm');
    const checkInInput = document.getElementById('checkIn');
    const checkOutInput = document.getElementById('checkOut');

    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    checkInInput.min = today;
    checkOutInput.min = today;

    // Update checkout minimum date when check-in changes
    checkInInput.addEventListener('change', () => {
        const checkInDate = new Date(checkInInput.value);
        const minCheckOut = new Date(checkInDate);
        minCheckOut.setDate(minCheckOut.getDate() + 1);
        checkOutInput.min = minCheckOut.toISOString().split('T')[0];

        // Reset checkout if it's before the new minimum
        if (checkOutInput.value && new Date(checkOutInput.value) <= checkInDate) {
            checkOutInput.value = '';
        }
    });

    // Form submission handler
    if (reservationForm) {
        reservationForm.addEventListener('submit', (e) => {
            e.preventDefault();

            // Validate dates
            const checkIn = new Date(checkInInput.value);
            const checkOut = new Date(checkOutInput.value);

            if (checkOut <= checkIn) {
                alert('Check-out date must be after check-in date.');
                return;
            }

            // Calculate number of nights
            const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));

            // Collect form data
            const formData = new FormData(reservationForm);
            const data = {
                firstName: formData.get('firstName'),
                lastName: formData.get('lastName'),
                email: formData.get('email'),
                phone: formData.get('phone'),
                checkIn: formData.get('checkIn'),
                checkOut: formData.get('checkOut'),
                nights: nights,
                roomType: formData.get('roomType'),
                guests: formData.get('guests'),
                specialRequests: formData.get('specialRequests'),
                addons: formData.getAll('addons')
            };

            console.log('Reservation Data:', data);

            // Show success message
            showMessage('success', `Thank you, ${data.firstName}! Your reservation request for ${nights} night(s) has been received. We will contact you at ${data.email} within 24 hours to confirm.`);

            // Reset form
            reservationForm.reset();
        });
    }

    // Message display function
    function showMessage(type, message) {
        // Create message element
        const messageDiv = document.createElement('div');
        messageDiv.className = `${type}-message show`;
        messageDiv.textContent = message;

        // Insert at the top of the form
        reservationForm.insertBefore(messageDiv, reservationForm.firstChild);

        // Scroll to message
        messageDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        // Remove message after 10 seconds
        setTimeout(() => {
            messageDiv.classList.remove('show');
            setTimeout(() => messageDiv.remove(), 300);
        }, 10000);
    }
});
