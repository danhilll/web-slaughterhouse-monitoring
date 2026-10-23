// Legacy administrator invoice reads return stored documents. Once a delivery is
// completed, the driver's last shared position must not be exposed there.
// Only delivery.location is removed: the fixed destination pin, drop-off data,
// staff attribution and every other oversight field stay as stored. The stored
// record and audit history are never modified; this returns a copy.
export const maskCompletedDeliveryLocation = invoice => {
  const delivery = invoice?.delivery;
  if (!delivery || typeof delivery !== 'object' || delivery.status !== 'delivered' || !('location' in delivery)) return invoice;
  const { location, ...rest } = delivery;
  return { ...invoice, delivery: rest };
};
