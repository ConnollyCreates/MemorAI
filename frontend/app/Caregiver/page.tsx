export default function Caregiver() {
  return (
    <div className="min-h-screen bg-gray-50 p-6 pt-20">
      <div className="max-w-7xl mx-auto mt-3">
        <div className="flex justify-center items-start gap-12">
          
          {/*Left Side*/}
          <div className="w-80 grid grid-cols-1 gap-6">
            <div className="bg-white rounded-lg shadow p-4 flex items-center justify-center h-20">
              <h2 className="text-lg font-semibold text-gray-900">Name</h2>
            </div>

            <div className="bg-white rounded-lg shadow p-4 flex items-center justify-center h-20">
              <h2 className="text-lg font-semibold text-gray-900">Relationship</h2>
            </div>

            <div className="bg-white rounded-lg shadow p-4 flex items-center justify-center h-20">
              <h2 className="text-lg font-semibold text-gray-900">Activity</h2>
            </div>
          </div>

    {/*Right Side*/}
          <div className="w-80 bg-white rounded-lg shadow p-4">
            <div className="h-80 bg-gray-50 rounded border-2 border-dashed border-gray-300 flex items-center justify-center">
              <p className="text-lg text-gray-500">UPLOAD</p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
