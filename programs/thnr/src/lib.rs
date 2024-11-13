use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("ADcEPjPWwaeGLHcMdPGCJxuFKAMe68WjWLvD2MkRv89c");

#[program]
pub mod thnr {
    use super::*;

    pub fn initialize_user(ctx: Context<InitializeUser>) -> Result<()> {
        let user_profile = &mut ctx.accounts.user_profile;
        user_profile.user = *ctx.accounts.user.key;
        user_profile.post_count = 0;
        Ok(())
    }

    pub fn initialize_post(ctx: Context<InitializePost>, title: String, content: String) -> Result<()> {
        let transfer_accounts = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault_account.to_account_info(),
        };

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
        );

        transfer(cpi_context, 1_000_000)?;

        let user_profile = &mut ctx.accounts.user_profile;
        let post = &mut ctx.accounts.post;

        user_profile.post_count += 1;

        post.author = *ctx.accounts.user.key;
        post.title = title;
        post.content = content;
        post.like_count = 0;
        post.comments = vec![];
        Ok(())
    }

    pub fn like_post(ctx: Context<LikePost>) -> Result<()> {
        let transfer_accounts = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.author_account.to_account_info(),
        };

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
        );

        transfer(cpi_context, 1_000)?;

        let post = &mut ctx.accounts.post;
        post.like_count += 1;
        Ok(())
    }

    pub fn comment_post(ctx: Context<CommentPost>, content: String) -> Result<()> {
        let transfer_accounts = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.vault_account.to_account_info(),
        };

        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
        );

        transfer(cpi_context, 1_000_000)?;

        let post = &mut ctx.accounts.post;
        post.comments.push(Comment {
            author: *ctx.accounts.user.key,
            content,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    pub fn delete_post(ctx: Context<DeletePost>) -> Result<()> {
        let user_key = ctx.accounts.user.key();
        let signer_seeds: &[&[&[u8]]] =
            &[&[b"vault", user_key.as_ref(), &[ctx.bumps.vault_account]]];

        let transfer_accounts = Transfer {
            from: ctx.accounts.vault_account.to_account_info(),
            to: ctx.accounts.user.to_account_info(),
        };
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            transfer_accounts,
        ).with_signer(signer_seeds);
        transfer(cpi_context, ctx.accounts.vault_account.lamports())?;

        ctx.accounts.post.close(ctx.accounts.user.to_account_info())?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeUser<'info> {
    #[account(init, payer = user, space = 8 + 32 + 8, seeds = [b"user_profile", user.key().as_ref()], bump)]
    pub user_profile: Account<'info, UserProfile>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(title: String, content: String)]
pub struct InitializePost<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, seeds = [b"user_profile", user.key().as_ref()], bump)]
    pub user_profile: Account<'info, UserProfile>,

    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump,
    )]
    pub vault_account: SystemAccount<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + 32 + 8192 + 8 + 8,
        seeds = [b"post", user.key().as_ref(), &user_profile.post_count.to_le_bytes()],
        bump,
    )]
    pub post: Account<'info, Post>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct LikePost<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, address = post.author)]
    pub author_account: SystemAccount<'info>,

    #[account(mut)]
    pub post: Account<'info, Post>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(content: String)]
pub struct CommentPost<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump,
    )]
    pub vault_account: SystemAccount<'info>,

    #[account(mut)]
    pub post: Account<'info, Post>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeletePost<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault", user.key().as_ref()],
        bump,
    )]
    pub vault_account: SystemAccount<'info>,

    #[account(
        mut,
        close = user,
    )]
    pub post: Account<'info, Post>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct UserProfile {
    pub user: Pubkey,
    pub post_count: u64,
}

#[account]
pub struct Post {
    pub author: Pubkey,
    pub title: String,
    pub content: String,
    pub like_count: u64,
    pub comments: Vec<Comment>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Comment {
    pub author: Pubkey,
    pub content: String,
    pub timestamp: i64,
}
