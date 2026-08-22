"use client";

import Link from "next/link";

type Automation = {
  id: string;
  title?: string | null;
  trigger_type: string | null;
  dm_message: string | null;
  is_active: boolean;
  thumbnail_url?: string | null;
  media_url?: string | null;
  created_at: string;
};


export default function AutomationCard({
  automation,
}:{
  automation: Automation;
}){


return (

<div
className="
flex
items-center
gap-5
rounded-2xl
border
border-white/10
bg-white/[0.03]
p-5
"
>


{/* Thumbnail */}

<div
className="
h-20
w-20
overflow-hidden
rounded-xl
bg-black
"
>

{
automation.thumbnail_url || automation.media_url ?

<img
src={
automation.thumbnail_url ??
automation.media_url ??
""
}
className="
h-full
w-full
object-cover
"
/>

:

<div
className="
flex
h-full
items-center
justify-center
text-2xl
"
>
🎬
</div>

}

</div>



{/* Details */}

<div
className="
flex-1
"
>

<div
className="
flex
items-center
gap-3
"
>

<h3
className="
text-lg
font-semibold
"
>
Comment → DM
</h3>


<span
className={`
rounded-full
px-3
py-1
text-xs
font-medium

${
automation.is_active
?
"bg-green-500/20 text-green-400"
:
"bg-gray-500/20 text-gray-400"
}

`}
>

{
automation.is_active
?
"ON"
:
"OFF"
}

</span>


</div>



<p
className="
mt-2
line-clamp-2
text-sm
text-gray-400
"
>

{
automation.dm_message ||
"No message"
}

</p>


<p
className="
mt-2
text-xs
text-gray-500
"
>

Trigger:
{
automation.trigger_type || "Any comment"
}

</p>


</div>



{/* Edit */}

<Link

href={`/dashboard/automations/${automation.id}/edit`}

className="
rounded-xl
border
border-white/10
px-5
py-2
text-sm
hover:bg-white/10
"

>

Edit

</Link>



</div>

)

}