export default function Caregiver() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="flex-1 p-6 flex justify-end">
        <div className="w-1/2 grid grid-cols-1 gap-2 h-min-screen">

          <div className="bg-white rounded-lg shadow p-9">
            <h2 className="text-xl font-semibold text-gray-900 mb-4"></h2>
            <div className="h-30 bg-gray-50 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
              <p className="text-gray-500">UPLOAD</p>
            </div>
          </div>


          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4"></h2>
            <div className="h-30 bg-gray-50 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
              <p className="text-gray-500">UPLOAD</p>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4"></h2>
            <div className="h-30 bg-gray-50 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
              <p className="text-gray-500">UPLOAD</p>
            </div>
          </div>
        </div>    
      </div>
    </div>
  );
}
