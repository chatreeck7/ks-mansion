import { useState, useEffect } from 'react';

interface Room {
  room: string;
  floor: number;
  type: 'AC' | 'FAN';
  status: 'occupied' | 'available' | 'maintenance' | 'reserved';
  price: number;
  detail: string;
}

interface FloorData {
  floor: number;
  name: string;
  rooms: Room[];
  stats: {
    total: number;
    available: number;
    occupied: number;
    reserved: number;
    maintenance: number;
  };
}

const API_URL = 'https://script.google.com/macros/s/AKfycbxKCZ-Vd6TTZR1SzlDlugjx1KOoMpyVYjlduci5irFjDiJkCNQbLy-c1zoxZJXcKe-N/exec';

const statusConfig: Record<string, { bg: string; text: string; border: string; dot: string; label: string }> = {
  available: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-400', dot: 'bg-green-500', label: 'Available' },
  occupied: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-400', dot: 'bg-red-500', label: 'Occupied' },
  reserved: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-400', dot: 'bg-blue-500', label: 'Reserved' },
  maintenance: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-400', dot: 'bg-yellow-500', label: 'Maintenance' },
};

const defaultStatus = { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-400', dot: 'bg-gray-500', label: 'Unknown' };

const typeConfig: Record<string, { icon: string; label: string; description: string }> = {
  AC: { icon: '❄️', label: 'Air Conditioner', description: 'Climate-controlled room with air conditioning' },
  FAN: { icon: '🌀', label: 'Fan', description: 'Room with ceiling fan for ventilation' },
};

const defaultType = { icon: '🏠', label: 'Room', description: 'Standard room' };

interface RoomStatusProps {
  baseUrl: string;
}

interface TotalStats {
  total: number;
  available: number;
  occupied: number;
  reserved: number;
  maintenance: number;
}

export default function RoomStatus({ baseUrl }: RoomStatusProps) {
  const [floors, setFloors] = useState<FloorData[]>([]);
  const [activeFloor, setActiveFloor] = useState<number>(1);
  const [totalStats, setTotalStats] = useState<TotalStats>({ total: 0, available: 0, occupied: 0, reserved: 0, maintenance: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_URL, {
        method: 'GET',
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('API Response:', data);
      console.log('First item:', data[0]);

      // Handle different response formats
      let roomsArray: Room[] = [];
      if (Array.isArray(data)) {
        roomsArray = data;
      } else if (data && typeof data === 'object') {
        // Try common wrapper properties
        roomsArray = data.rooms || data.data || data.result || [];
      }

      if (roomsArray.length === 0) {
        setError('No rooms available at this time.');
        return;
      }

      // Map the API response to our Room interface
      const mappedRooms = roomsArray.map((item: any) => ({
        room: String(item.room_number || item.roomNumber || item.room || ''),
        floor: item.floor,
        type: item.type || 'AC',
        status: item.status || 'available',
        price: item.price || 0,
        detail: item.detail || '',
      }));

      console.log('First mapped room:', mappedRooms[0]);

      console.log('Mapped rooms:', mappedRooms);

      // Group rooms by floor based on room number (101-199 = Floor 1, 201-299 = Floor 2, etc.)
      const roomsByFloor: { [key: string]: Room[] } = {};

      mappedRooms.forEach((room: Room) => {
        // Extract floor from first digit of room number
        const roomNum = String(room.room);
        const floorKey = roomNum.charAt(0) || '1';
        if (!roomsByFloor[floorKey]) {
          roomsByFloor[floorKey] = [];
        }
        roomsByFloor[floorKey].push(room);
      });

      console.log('Rooms by floor:', roomsByFloor);

      // Create floor data with stats
      const floorData: FloorData[] = Object.keys(roomsByFloor)
        .sort((a, b) => Number(a) - Number(b))
        .map((floorKey) => {
          const floorRooms = roomsByFloor[floorKey] || [];
          const sortedRooms = [...floorRooms].sort((a, b) =>
            String(a.room).localeCompare(String(b.room))
          );
          const floorNum = Number(floorKey) || 0;
          return {
            floor: floorNum,
            name: `Floor ${floorKey}`,
            rooms: sortedRooms,
            stats: {
              total: sortedRooms.length,
              available: sortedRooms.filter((r) => r.status?.toLowerCase() === 'available').length,
              occupied: sortedRooms.filter((r) => r.status?.toLowerCase() === 'occupied').length,
              reserved: sortedRooms.filter((r) => r.status?.toLowerCase() === 'reserved').length,
              maintenance: sortedRooms.filter((r) => r.status?.toLowerCase() === 'maintenance').length,
            },
          };
        });

      // Calculate total stats across all floors
      const allRoomsStats: TotalStats = {
        total: mappedRooms.length,
        available: mappedRooms.filter((r) => r.status?.toLowerCase() === 'available').length,
        occupied: mappedRooms.filter((r) => r.status?.toLowerCase() === 'occupied').length,
        reserved: mappedRooms.filter((r) => r.status?.toLowerCase() === 'reserved').length,
        maintenance: mappedRooms.filter((r) => r.status?.toLowerCase() === 'maintenance').length,
      };

      setTotalStats(allRoomsStats);
      setFloors(floorData);
      if (floorData.length > 0) {
        setActiveFloor(floorData[0].floor);
      }
    } catch (err) {
      console.error('Error fetching rooms:', err);
      setError('Failed to load room data. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const activeFloorData = floors.find((f) => f.floor === activeFloor);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-text-light">Loading room status...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <div className="text-red-500 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p className="text-text-light mb-4">{error}</p>
        <button onClick={fetchRooms} className="btn btn-secondary">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Status Legend */}
      <div className="flex flex-wrap items-center gap-4 md:gap-6 mb-8 pb-6 border-b border-gray-200">
        <span className="text-sm text-text-light font-medium">Status:</span>
        {Object.entries(statusConfig).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${value.dot}`}></span>
            <span className="text-sm text-text-light">{value.label}</span>
          </div>
        ))}
      </div>

      {/* Floor Tabs */}
      <div className="mb-8">
        <div className="flex flex-wrap gap-2" role="tablist">
          {floors.map((floor) => (
            <button
              key={floor.floor}
              onClick={() => setActiveFloor(floor.floor)}
              className={`px-5 py-3 rounded-lg font-medium text-sm transition-all ${
                activeFloor === floor.floor
                  ? 'bg-primary text-white'
                  : 'bg-bg-light text-primary hover:bg-gray-200'
              }`}
              role="tab"
              aria-selected={activeFloor === floor.floor}
            >
              {floor.name}
              <span
                className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                  activeFloor === floor.floor
                    ? 'bg-white/20'
                    : 'bg-green-100 text-green-700'
                }`}
              >
                {floor.stats.available}/{floor.stats.total}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Total Summary - shows all rooms stats */}
      <div className="bg-bg-light rounded-xl p-6 mb-8">
        <h3 className="text-sm text-text-light mb-4 font-medium">All Rooms Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 md:gap-6">
          <div>
            <p className="text-sm text-text-light mb-1">Total Rooms</p>
            <p className="text-2xl font-light text-primary">{totalStats.total}</p>
          </div>
          <div>
            <p className="text-sm text-text-light mb-1">Available</p>
            <p className="text-2xl font-light text-green-600">{totalStats.available}</p>
          </div>
          <div>
            <p className="text-sm text-text-light mb-1">Occupied</p>
            <p className="text-2xl font-light text-red-600">{totalStats.occupied}</p>
          </div>
          <div>
            <p className="text-sm text-text-light mb-1">Reserved</p>
            <p className="text-2xl font-light text-blue-600">{totalStats.reserved}</p>
          </div>
          <div>
            <p className="text-sm text-text-light mb-1">Maintenance</p>
            <p className="text-2xl font-light text-yellow-600">{totalStats.maintenance}</p>
          </div>
        </div>
      </div>

      {activeFloorData && (
        <>

          {/* Room Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {activeFloorData.rooms.map((room, index) => {
              const statusKey = room.status?.toLowerCase() || 'unknown';
              const typeKey = room.type?.toUpperCase() || 'UNKNOWN';
              const status = statusConfig[statusKey] || defaultStatus;
              const type = typeConfig[typeKey] || defaultType;
              const roomId = `${activeFloor}-${room.room}-${index}`;
              const isHovered = hoveredRoom === roomId;

              return (
                <a
                  key={roomId}
                  href={`${baseUrl}/accommodations#${typeKey.toLowerCase()}`}
                  className={`relative block bg-white rounded-xl border-2 ${status.border} overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group`}
                  onMouseEnter={() => setHoveredRoom(roomId)}
                  onMouseLeave={() => setHoveredRoom(null)}
                >
                  {/* Room Header */}
                  <div className={`${status.bg} px-4 py-3 text-center`}>
                    <span className="font-semibold text-primary text-lg">{room.room}</span>
                  </div>

                  {/* Room Body */}
                  <div className="p-4 text-center">
                    {/* Type Icon */}
                    <div className="text-3xl mb-2">{type.icon}</div>
                    <p className="text-sm font-medium text-primary mb-1">{type.label}</p>

                    {/* Status Badge */}
                    <span className={`inline-block text-xs font-medium px-3 py-1 rounded-full ${status.bg} ${status.text}`}>
                      {status.label}
                    </span>

                    {/* Price */}
                    {room.status === 'available' && (
                      <p className="mt-3 text-accent font-medium">฿{room.price}/night</p>
                    )}
                  </div>

                  {/* Hover Overlay */}
                  <div
                    className={`absolute inset-0 bg-primary/95 text-white p-4 flex flex-col justify-center items-center text-center transition-opacity duration-300 ${
                      isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'
                    }`}
                  >
                    <div className="text-4xl mb-3">{type.icon}</div>
                    <h4 className="font-medium text-lg mb-2">Room {room.room}</h4>
                    <p className="text-sm text-white/80 mb-3">{type.description}</p>
                    {room.detail && <p className="text-sm text-white/70 mb-3">{room.detail}</p>}
                    <span className="text-xs text-accent underline">View room type details →</span>
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
