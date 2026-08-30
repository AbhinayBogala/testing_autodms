export type InstagramComment = {
    id: string;
    instagram_post_id: string;
  
    instagram_comment_id: string | null;
  
    commenter_instagram_id: string | null;
    commenter_username: string | null;
  
    comment_text: string | null;
  
    parent_comment_id: string | null;
  
    public_reply_sent: boolean | null;
    public_reply_text: string | null;
    public_reply_at: string | null;
  
    dm_sent: boolean | null;
  
    created_at: string | null;
  
    /*
     * Threaded / hierarchical comments.
     */
    replies: InstagramComment[];
  };