export default function Caregiver() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 pt-20">
      <div className="max-w-7xl mx-auto mt-3">
        {/*First row*/}
        <div className="flex justify-center items-center gap-12 mb-6">
          <div className="w-80 bg-white rounded-lg shadow p-4 flex items-center justify-center h-20">
            <h2 className="text-lg font-semibold text-gray-900">Name</h2>
          </div>

          <div className="w-80 bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3"></h2>
            <div className="h-32 bg-gray-50 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
              <p className="text-sm text-gray-500">UPLOAD</p>
            </div>
          </div>
        </div>

        {/*Second row*/}
        <div className="flex justify-center items-center gap-12 mb-6">
          <div className="w-80 bg-white rounded-lg shadow p-4 flex items-center justify-center h-20">
            <h2 className="text-lg font-semibold text-gray-900">
              Relationship
            </h2>
          </div>

          <div className="w-80 bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3"></h2>
            <div className="h-32 bg-gray-50 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
              <p className="text-sm text-gray-500">UPLOAD</p>
            </div>
          </div>
        </div>

        {/*Third row*/}
        <div className="flex justify-center items-center gap-12">
          <div className="w-80 bg-white rounded-lg shadow p-4 flex items-center justify-center h-20">
            <h2 className="text-lg font-semibold text-gray-900">Activity</h2>
          </div>

          <div className="w-80 bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3"></h2>
            <div className="h-32 bg-gray-50 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
              <p className="text-sm text-gray-500">UPLOAD</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
