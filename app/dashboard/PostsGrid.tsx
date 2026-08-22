"use client";

import { useState } from "react";

type Post = {
  id: string;
  instagram_media_id: string;
  caption: string | null;
  media_type: string | null;
  media_url: string | null;
  permalink: string | null;
  likes_count: number | null;
  comments_count: number | null;
};

export default function PostsGrid({
  posts,
}: {
  posts: Post[];
}) {

  const [selectedPost, setSelectedPost] =
    useState<Post | null>(null);


  return (
    <>
      <div className="
        mt-6
        grid
        gap-5
        sm:grid-cols-2
        lg:grid-cols-4
        xl:grid-cols-5
      ">

        {posts.map((post)=>(

          <button
            key={post.id}
            onClick={()=>setSelectedPost(post)}
            className="
              group
              overflow-hidden
              rounded-3xl
              border
              border-white/10
              bg-white/[0.03]
              text-left
              transition
              hover:-translate-y-1
              hover:border-white/30
              hover:bg-white/[0.06]
            "
          >

            <div className="
              relative
              aspect-square
              overflow-hidden
              bg-black
            ">

              {
              post.media_type === "VIDEO" ||
              post.media_type === "REEL"
              ?

              <video
                src={post.media_url ?? ""}
                muted
                className="
                  h-full
                  w-full
                  object-cover
                  transition
                  duration-500
                  group-hover:scale-110
                "
              />

              :

              <img
                src={post.media_url ?? ""}
                alt="Instagram post"
                className="
                  h-full
                  w-full
                  object-cover
                  transition
                  duration-500
                  group-hover:scale-110
                "
              />

              }


              <div className="
                absolute
                inset-0
                bg-gradient-to-t
                from-black/60
                via-transparent
                opacity-0
                transition
                group-hover:opacity-100
              "/>


              <span className="
                absolute
                left-3
                top-3
                rounded-full
                bg-black/60
                px-3
                py-1
                text-xs
                text-white
                backdrop-blur
              ">
                {post.media_type ?? "MEDIA"}
              </span>


            </div>



            <div className="p-4">


              <p className="
                line-clamp-2
                text-sm
                text-gray-300
              ">
                {post.caption || "No description"}
              </p>



              <div className="
                mt-4
                flex
                gap-4
                text-xs
                text-gray-400
              ">

                <span>
                  ❤️ {post.likes_count ?? 0}
                </span>


                <span>
                  💬 {post.comments_count ?? 0}
                </span>


              </div>


            </div>


          </button>


        ))}


      </div>




      {
      selectedPost && (

        <div
          onClick={()=>setSelectedPost(null)}
          className="
            fixed
            inset-0
            z-50
            flex
            items-center
            justify-center
            bg-black/80
            p-5
            backdrop-blur-md
          "
        >


          <div
            onClick={(e)=>e.stopPropagation()}
            className="
              relative
              grid
              max-h-[90vh]
              w-full
              max-w-6xl
              overflow-hidden
              rounded-3xl
              border
              border-white/10
              bg-[#111]
              shadow-2xl
              lg:grid-cols-2
            "
          >


            <button
              onClick={()=>setSelectedPost(null)}
              className="
                absolute
                right-5
                top-5
                z-10
                rounded-full
                bg-black/60
                px-4
                py-2
                text-gray-300
                hover:bg-white/10
              "
            >
              ✕
            </button>



            <div className="
              flex
              items-center
              justify-center
              bg-black
            ">


              {
              selectedPost.media_type==="VIDEO" ||
              selectedPost.media_type==="REEL"

              ?

              <video
                src={selectedPost.media_url ?? ""}
                controls
                className="
                  max-h-[80vh]
                  max-w-full
                  object-contain
                "
              />

              :

              <img
                src={selectedPost.media_url ?? ""}
                className="
                  max-h-[80vh]
                  max-w-full
                  object-contain
                "
              />

              }


            </div>




            <div className="
              flex
              flex-col
              p-8
            ">


              <span className="
                w-fit
                rounded-full
                border
                border-white/10
                bg-white/5
                px-3
                py-1
                text-xs
                text-gray-300
              ">
                {selectedPost.media_type ?? "MEDIA"}
              </span>



              <h2 className="
                mt-5
                text-3xl
                font-bold
              ">
                Post Details
              </h2>




              <div className="
                mt-6
                grid
                grid-cols-2
                gap-4
              ">


                <div className="
                  rounded-2xl
                  border
                  border-white/10
                  bg-white/5
                  p-5
                ">
                  <p className="text-xs text-gray-500">
                    Likes
                  </p>

                  <p className="mt-2 text-xl font-bold">
                    ❤️ {selectedPost.likes_count ?? 0}
                  </p>
                </div>



                <div className="
                  rounded-2xl
                  border
                  border-white/10
                  bg-white/5
                  p-5
                ">
                  <p className="text-xs text-gray-500">
                    Comments
                  </p>

                  <p className="mt-2 text-xl font-bold">
                    💬 {selectedPost.comments_count ?? 0}
                  </p>

                </div>


              </div>




              <div className="mt-6">

                <h3 className="
                  text-sm
                  font-semibold
                  text-gray-400
                ">
                  Description
                </h3>


                <p className="
                  mt-3
                  max-h-40
                  overflow-y-auto
                  text-sm
                  leading-6
                  text-gray-200
                ">
                  {selectedPost.caption ||
                  "No description available."}
                </p>

              </div>




              {
              selectedPost.permalink && (

                <a
                  href={selectedPost.permalink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-auto pt-8"
                >

                  <button className="
                    w-full
                    rounded-xl
                    bg-white
                    px-5
                    py-3
                    font-semibold
                    text-black
                    hover:bg-gray-200
                  ">
                    View on Instagram ↗
                  </button>

                </a>

              )
              }



            </div>


          </div>


        </div>

      )
      }


    </>
  );
}