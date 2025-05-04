
import Navigation from "@/components/Navigation";
import StreamCreator from "@/components/StreamCreator";

const CreateStream = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <Navigation />
      
      <main className="flex-1 container py-8">
        <h1 className="text-3xl font-bold mb-6">Create Stream</h1>
        <StreamCreator />
      </main>
    </div>
  );
};

export default CreateStream;
